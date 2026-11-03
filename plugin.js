/// <reference path="./sdk/types.d.ts" />
// Related Sections: keeps titled native query blocks at the bottom of pages, per the definitions in
// this plugin's Configuration tab (custom.sections). See README.md for the format.

const MARKER = "rs-managed";
const CONTAINER_TITLE = "Related content";
const LINKS_TOKEN = /\{links:([^}]*)\}/g;

/** The guids a `self` or `self.Field` source stands for on this page. */
function sourceGuids(source, page) {
    if (source === "self") return [page.guid];
    if (!source.startsWith("self.")) return [];
    return (page.prop(source.slice(5))?.linkedRecords() ?? []).map((r) => r.guid);
}

/** Expands each `{links: self, self.Field}` token to `(@linkto=a OR @linkto=b)`. */
function expandQuery(template, page) {
    return template.replace(LINKS_TOKEN, (_, sources) => {
        const guids = [...new Set(sources.split(",").flatMap((s) => sourceGuids(s.trim(), page)))];
        if (!guids.length) return "@linkto=none";
        const terms = guids.map((g) => `@linkto=${g}`);
        return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
    });
}

const lineText = (line) => (line.segments ?? []).map((s) => s.text ?? "").join("");
const isManaged = (line) => line.props?.css_class === MARKER;
const byGuid = (a, b) => (a.guid < b.guid ? -1 : 1);

export class Plugin extends AppPlugin {
    onLoad() {
        this._sections = this.getConfiguration().custom?.sections ?? {};
        this._running = new Map();
        this._panelTimer = 0;
        this._recordTimers = new Map();
        this._handlers = [
            this.events.on("panel.navigated", () => this._schedulePanels()),
            // Only the client that made a change rewrites, so devices don't race each other.
            // Changes from elsewhere are caught when the page is next opened.
            this.events.on("record.updated", (ev) => {
                if (ev.source?.isLocal && ev.recordGuid) this._scheduleRecord(ev.recordGuid);
            }, { collection: "*" }),
        ];
        this._schedulePanels();
    }

    onUnload() {
        clearTimeout(this._panelTimer);
        for (const timer of this._recordTimers?.values() ?? []) clearTimeout(timer);
        // Preview can call onUnload on an instance whose onLoad never ran.
        for (const id of this._handlers ?? []) this.events.off(id);
    }

    _schedulePanels() {
        clearTimeout(this._panelTimer);
        this._panelTimer = setTimeout(() => {
            for (const panel of this.ui.getPanels()) {
                const record = panel.getNavigation()?.type === "edit_panel" ? panel.getActiveRecord() : null;
                if (record) this._sync(record.guid);
            }
        }, 150);
    }

    _scheduleRecord(guid) {
        clearTimeout(this._recordTimers.get(guid));
        this._recordTimers.set(guid, setTimeout(() => {
            this._recordTimers.delete(guid);
            this._sync(guid);
        }, 500));
    }

    /** One sync per record at a time; a request during a run gets one more run afterward. */
    _sync(guid) {
        const state = this._running.get(guid);
        if (state) {
            state.again = true;
            return;
        }
        const next = { again: false };
        this._running.set(guid, next);
        this._syncRecord(guid)
            .catch((e) => console.warn("[related-sections]", e))
            .finally(() => {
                this._running.delete(guid);
                if (next.again) this._sync(guid);
            });
    }

    async _definitionsFor(guid) {
        for (const collection of await this.data.getAllCollections()) {
            const defs = this._sections[collection.getName()];
            if (!defs) continue;
            if ((await collection.getAllRecords()).some((r) => r.guid === guid)) return defs;
        }
        return null;
    }

    async _syncRecord(guid) {
        const defs = await this._definitionsFor(guid);
        const page = defs && this.data.getRecord(guid);
        if (!page) return;

        // Items of type "document" are linked records, not lines on this page.
        const lines = (await page.getLineItems()).filter((l) => l.type !== "document");
        const managed = lines.filter(isManaged).sort(byGuid);
        const childrenOf = (line) => managed.filter((l) => l.parent_guid === line.guid);

        // The lowest guid wins among duplicates from two clients writing at once, so every client
        // keeps the same one.
        const headings = managed.filter((l) => l.type === "heading");
        let container = headings.find((l) => lineText(l) === CONTAINER_TITLE) ?? null;
        if (!container) {
            const roots = lines.filter((l) => l.parent_guid === guid && !isManaged(l));
            // A new page gets an empty line above the sections to type in.
            const last = roots.length ? roots[roots.length - 1] : await page.createLineItem(null, null, "text", [], null);
            container = await page.createLineItem(null, last, "heading",
                [{ type: "text", text: CONTAINER_TITLE }], { hsize: 1, css_class: MARKER });
        }

        const titles = new Set(defs.map((d) => d.title));
        const kept = new Map();
        // Matched by title wherever they sit, since a mirror round trip can change a line's parent.
        // Queries are left out: they go with the section above them.
        for (const line of managed.filter((l) => l.type !== "query" && l !== container)) {
            const title = lineText(line);
            if (line.type === "heading" && titles.has(title) && !kept.has(title)) kept.set(title, line);
            else await this._remove(line, lines);
        }

        let previous = [...kept.values()].pop() ?? null;
        for (const def of defs) {
            let section = kept.get(def.title);
            if (!section) {
                section = await page.createLineItem(container, previous, "heading",
                    [{ type: "text", text: def.title }], { hsize: 2, css_class: MARKER });
                previous = section;
            }
            const expr = expandQuery(def.query, page);
            const [query, ...extra] = childrenOf(section).filter((l) => l.type === "query");
            for (const q of extra) await q.delete();
            if (!query) await page.createLineItem(section, null, "query", null, { filter_expr: expr, css_class: MARKER });
            else if (query.props?.filter_expr !== expr) await query.setMetaProperty("filter_expr", expr);
        }
    }

    /** Deletes a marked line and its marked descendants, keeping any line with the user's own lines under it. */
    async _remove(line, lines) {
        const children = lines.filter((l) => l.parent_guid === line.guid);
        for (const child of children) if (isManaged(child)) await this._remove(child, lines);
        if (!children.some((c) => !isManaged(c))) await line.delete();
    }
}
