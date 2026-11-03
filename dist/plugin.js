"use strict";
var plugins = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // plugin.js
  var plugin_exports = {};
  __export(plugin_exports, {
    Plugin: () => Plugin
  });
  var MARKER = "rs-managed";
  var CONTAINER_TITLE = "Related content";
  var LINKS_TOKEN = /\{links:([^}]*)\}/g;
  function sourceGuids(source, page) {
    if (source === "self") return [page.guid];
    if (!source.startsWith("self.")) return [];
    return (page.prop(source.slice(5))?.linkedRecords() ?? []).map((r) => r.guid);
  }
  __name(sourceGuids, "sourceGuids");
  function expandQuery(template, page) {
    return template.replace(LINKS_TOKEN, (_, sources) => {
      const guids = [...new Set(sources.split(",").flatMap((s) => sourceGuids(s.trim(), page)))];
      if (!guids.length) return "@linkto=none";
      const terms = guids.map((g) => `@linkto=${g}`);
      return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
    });
  }
  __name(expandQuery, "expandQuery");
  var lineText = /* @__PURE__ */ __name((line) => (line.segments ?? []).map((s) => s.text ?? "").join(""), "lineText");
  var isManaged = /* @__PURE__ */ __name((line) => line.props?.css_class === MARKER, "isManaged");
  var byGuid = /* @__PURE__ */ __name((a, b) => a.guid < b.guid ? -1 : 1, "byGuid");
  var Plugin = class extends AppPlugin {
    static {
      __name(this, "Plugin");
    }
    onLoad() {
      this._sections = this.getConfiguration().custom?.sections ?? {};
      this._running = /* @__PURE__ */ new Map();
      this._panelTimer = 0;
      this._recordTimers = /* @__PURE__ */ new Map();
      this._handlers = [
        this.events.on("panel.navigated", () => this._schedulePanels()),
        // Only the client that made a change rewrites, so devices don't race each other.
        // Changes from elsewhere are caught when the page is next opened.
        this.events.on("record.updated", (ev) => {
          if (ev.source?.isLocal && ev.recordGuid) this._scheduleRecord(ev.recordGuid);
        }, { collection: "*" })
      ];
      this._schedulePanels();
    }
    onUnload() {
      clearTimeout(this._panelTimer);
      for (const timer of this._recordTimers?.values() ?? []) clearTimeout(timer);
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
      this._syncRecord(guid).catch((e) => console.warn("[related-sections]", e)).finally(() => {
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
      const lines = (await page.getLineItems()).filter((l) => l.type !== "document");
      const managed = lines.filter(isManaged).sort(byGuid);
      const childrenOf = /* @__PURE__ */ __name((line) => managed.filter((l) => l.parent_guid === line.guid), "childrenOf");
      const headings = managed.filter((l) => l.type === "heading");
      let container = headings.find((l) => lineText(l) === CONTAINER_TITLE) ?? null;
      if (!container) {
        const roots = lines.filter((l) => l.parent_guid === guid && !isManaged(l));
        const last = roots.length ? roots[roots.length - 1] : await page.createLineItem(null, null, "text", [], null);
        container = await page.createLineItem(
          null,
          last,
          "heading",
          [{ type: "text", text: CONTAINER_TITLE }],
          { hsize: 1, css_class: MARKER }
        );
      }
      const titles = new Set(defs.map((d) => d.title));
      const kept = /* @__PURE__ */ new Map();
      for (const line of managed.filter((l) => l.type !== "query" && l !== container)) {
        const title = lineText(line);
        if (line.type === "heading" && titles.has(title) && !kept.has(title)) kept.set(title, line);
        else await this._remove(line, lines);
      }
      let previous = [...kept.values()].pop() ?? null;
      for (const def of defs) {
        let section = kept.get(def.title);
        if (!section) {
          section = await page.createLineItem(
            container,
            previous,
            "heading",
            [{ type: "text", text: def.title }],
            { hsize: 2, css_class: MARKER }
          );
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
  };
  return __toCommonJS(plugin_exports);
})();
