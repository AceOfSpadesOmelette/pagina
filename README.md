# Pagina

Export an Obsidian note to PDF, with page size, margins, headers, and footers.

Desktop export uses Obsidian's print-to-PDF path and can open a native Save dialog. Headers and footers can use the same font as the note, including a vault `@font-face`.

**Mobile export is disabled** — it is not stable enough yet. Pagina is marked desktop-only until that path is ready.

## Install

Copy these files into `<vault>/.obsidian/plugins/pagina/`:

- `main.js`
- `manifest.json`
- `styles.css`
- `woff2.cjs`
- `woff2.wasm`

Then enable **Pagina** in Settings → Community plugins. Reload Obsidian after replacing the files.

`woff2.cjs` and `woff2.wasm` are a vendored copy of the [Google woff2](https://github.com/google/woff2) decoder (Apache-2.0). Chromium's header and footer document cannot load a vault `@font-face`, so Pagina decodes that font and stamps the text onto the PDF.

## Use

Open a note, then use the ribbon icon, the command **Export current note to PDF**, or **Export to PDF (Pagina)** in the file or editor menu.

The export window previews the note as HTML or as PDF pages. Settings cover:

- Page size, orientation, and margins. Orientation is Portrait or Landscape; Portrait is the default.
- A header and footer, each with left, center, and right slots
- Border styles and colors for the header and footer
- Font and text color. A blank font uses the vault text font
- Date and time formats

**Import settings** and **Export settings** at the bottom of the settings pane save or restore that configuration as `pagina-settings.json`.

The preview and PDF use a light page. Pagina remaps text and interactive colors on that page so embedded controls stay readable when Obsidian is in dark mode.

Slots accept these tokens:

| Token | Result |
| --- | --- |
| `{{title}}` | Note name |
| `{{filename}}` | File name |
| `{{page}}` | Current page |
| `{{pages}}` | Page count |
| `{{date}}`, `{{time}}`, `{{datetime}}` | Local date and time |
| `{{datetime:YYYY-MM-DD}}` | A chosen format |
| `{{property:key}}` | A frontmatter property |

Date formats include `EPOCH`, `YYYYMMDD`, `YYYY-MM-DD`, `YYYYMMDD-HHMMSS`, `YYYY-MM-DD HH:MM`, and `YYYY-MM-DD HH:MM:SS`.

## Build

```bash
npm install
npm run build
```

`npm run build` typechecks the source and writes `main.js`. The woff2 files are not produced by the build; keep them next to `main.js`.



## Develop

```bash
npm install
npm run build
npm test
```

CI runs build + Jest on push/PR. Tag a version matching `manifest.json` (for example `1.0.0`) to create a draft GitHub release with `main.js`, `manifest.json`, and `styles.css` when present.
