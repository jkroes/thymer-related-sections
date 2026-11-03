# Related Sections

Keeps a "Related content" area of titled query blocks at the bottom of your pages, with queries that follow the page's own fields. A meeting can
list every open discussion with its organizers or attendees, and a person can list their meetings. On its own, a query
block can't refer to the page it's on, so the plugin writes the right query into each page and updates it when the page
changes. Each section is a level 2 heading with a query block under it, all below a level 1 heading, so they look,
collapse and work with the keyboard like any others.

## Install

In Thymer, open the command palette (⌘P), choose **Plugins → Create Plugin**, then:

1. Paste `dist/plugin.js` into **Custom Code**.
2. Paste `plugin.json` into **Configuration**, and change the sections to suit your collections.
3. Click **Preview**, then **Save**.

## Defining sections

Sections live in the plugin's Configuration tab, under `custom.sections`, grouped by the collection of the page they
appear on. Saving reloads the plugin.

```json
{
  "custom": {
    "sections": {
      "Meetings": [
        {
          "title": "To discuss",
          "query": "@page @collection=\"Discussions\" {links: self, self.Attendees, self.Organizers} @Discussions.Status!=\"Done\""
        }
      ]
    }
  }
}
```

`query` is a normal Thymer query, so AND, OR, grouping and `@sort` all work. Sort with the collection and field, for
example `@sort=-"Meetings"."Date"` for newest first. Thymer has no way to limit the number of rows.

`{links: ...}` is the one addition. It becomes a filter for records that link to any of the listed sources:

| Source | Meaning |
|---|---|
| `self` | The page you're on |
| `self.Organizers` | Everyone in that page's `Organizers` field |

On a meeting organized by Sam, `{links: self, self.Organizers}` becomes
`(@linkto=<meeting> OR @linkto=<Sam>)`.

Without a field name in it, `{links: ...}` matches a link from any field. If you need one specific field, add a filter on
that field too, for example `{links: self} @Discussions."Discuss with"="Sam Lee"`. That filter matches on titles,
so the query won't follow a rename.

## Using the sections

- **When they appear:** the first time you open a page in a configured collection. An empty page also gets a blank line
  above them to type in.
- **Your notes:** keep them above the "Related content" heading. Lines added below it become part of it, and collapsing it
  hides them.
- **Collapsing:** use the chevron or ⌘/, on the heading or on any one section. Thymer remembers this per device.
- **Changes:** when a page's fields change, its query updates within a second or so. If the change came from another
  device, it updates the next time you open the page.
- **Deleting a section:** it comes back the next time you open the page. To remove it for good, take it out of the
  configuration; the plugin then removes it from each page as you open them, keeping its heading if you've written
  under it.
- **Renaming a section:** change its title in the configuration, not on the page. A heading changed on the page is treated
  as a removed section, and a new one is added.

## Turning it off

Switch the plugin off in **Plugins**. The sections stay on your pages and keep working as ordinary query blocks, but their
queries stop updating and new pages don't get them.

## How it works (for the curious)

1. When you open a page, or change one on this device, the plugin looks up the sections for its collection.
2. It works out what each section's query should be and compares that with what's on the page.
3. It adds what's missing and changes a query only if it differs, so opening a page normally writes nothing.
4. It tags the lines it writes so it can recognize them later. This is what the `{class=rs-managed}` next to them in the
   Markdown Mirror means, and removing it makes the plugin treat them as your own lines.
5. If two devices add the same section at once, the next time either one opens the page it keeps one copy and removes the
   other.
