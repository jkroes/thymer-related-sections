# Related Sections

A Thymer plugin. **Platform knowledge and workspace rules live in the `thymer` skill
(`~/.claude/skills/thymer/`) and the parent repo's `CLAUDE.md` (`~/repos/thymer`)** —
this file holds only what is specific to this plugin.

Mechanics (all repos identical): `./setup.sh` re-links `sdk/`, `bin/thymercli` and
`examples/` from the shared cache (they're gitignored symlinks — don't edit `sdk/`);
`./build.sh .` bundles to `dist/plugin.js`, the paste-ready form (committed on purpose;
`hooks/pre-push` keeps it in sync with source).

## Notes

Live as the global plugin "Related Sections" (created 2026-11-02). Remote: jkroes/thymer-related-sections (public). Deploy with
`./build.sh . && ./bin/thymercli plugin update code "Related Sections" --file dist/plugin.js -w <ws>`.
The config lives in `plugin.json`, but a config write replaces the whole object: re-read the live config and patch it.

It writes native lines into pages, marked `css_class: rs-managed`: a level 1 "Related content" heading, a level 2 heading per section, and the query under that (user's layout, 2026-11-02). Children of a heading render at its indent, so nothing looks nested. Marked lines that match no section are removed, which also converts older layouts. It replaced a first version that rendered
its own DOM above the backlinks (see `notes/tana-port/automation-plugin-shapes.md`): the keyboard
can't reach plugin DOM, but it does walk query result rows.

Sync: desired query vs `line.props.filter_expr`, write only on a difference. Triggers are `panel.navigated` (any client) and
local `record.updated`. Remote changes wait for the next page open, so that clients don't race.

Verified 2026-11-02 in the debug Chrome (web): stamping an empty page and a page with notes; reopening writes nothing;
typing right after a first stamp lands in the blank line; a duplicate section is removed on open. Verified with the desktop
client: an MCP change to `Attendees` rewrote the query within seconds, both adding and removing. Earlier the same day, on
hand-built blocks: keyboard path through rows and headings, fold persistence across reload, block sort.

Folding on the final layout confirmed by the user. Not verified: two clients stamping at the same moment (healing was
tested with a duplicate made through the mirror); undo after a plugin write; dark themes.
