# Pagina

Export the open note to PDF on desktop. You can set the page size, margins, headers, and footers.

Export is desktop only. Mobile export is turned off until it is reliable.

Open a note, then use the ribbon icon **Pagina: Export to PDF**, the command **Export current note to PDF**, or **Export to PDF (pagina)** in the file menu or the editor menu. On desktop, Pagina can open a Save dialog.

The export window previews the note as the page or as PDF pages. The page is light, and text and controls are adjusted so they stay readable when Obsidian is in dark mode.

## What you can set

Open **Settings → Pagina**, or change the same options in the export window.

- Page size, portrait or landscape, margins, and downscale. Portrait is the default.
- Exam cheat sheet: 2, 3, or 4 columns in portrait or landscape. Compact keeps each line and tightens the spacing. Continuous joins the note into one run, except code, tables, images, math, and diagrams. Text size is in points, and headings can use that same size. Page size, orientation, margins, headers, and footers stay as you set them. Downscale still scales the whole page.
- The note title at the top of the export, whether that title is centered, and whether the note’s properties are printed under it. In the export window the title can be typed. It starts from the note’s title property, or the file name when that property is empty. Leaving it blank uses the file name. The typed title is not saved into the note.
- Whether Heading 1 starts a new page, and whether it is centered or underlined
- A header and a footer, each with left, center, and right text
- Border style and color for the header and footer
- Font and text color. A blank font uses the vault’s text font, including a font installed for the vault.
- PDF preview, printed backgrounds, the outline, metadata, and a timestamp on the file name
- Tagged PDF: accessibility structure so a screen reader can follow headings and paragraphs. The image-based export cannot be fully tagged.
- Separate switches for table-of-contents links and for heading text that jumps back to the contents
- Whether to open the PDF after export

Under **Backup**, **Export settings** and **Import settings** save or restore that configuration as `pagina-settings.json`.

## Header and footer tokens

| Token | Result |
| --- | --- |
| `{{title}}` | Printed note title. In the export window this is the title you type. Otherwise it is the note’s title property, or the file name when that property is empty. |
| `{{filename}}` | File name |
| `{{section}}` | Heading of the chosen level in effect at the top of the page. If that level is missing, the deepest heading still in effect is used, and a later heading replaces one of the same or deeper level. |
| `{{page}}` | Current page |
| `{{pages}}` | Page count |
| `{{date}}`, `{{time}}`, `{{datetime}}` | Local date and time |
| `{{datetime:YYYY-MM-DD}}` | A chosen format |
| `{{property:key}}` | A property from the note’s properties. Lists, such as tags, are joined with commas. `{{property:key[0]}}` prints one item, starting at 0. Names are case-sensitive and may contain spaces. A field can mix these tokens with other text. An index past the end of the list stops the export before a PDF is written. |

Date formats include `EPOCH`, `YYYYMMDD`, `YYYY-MM-DD`, `YYYYMMDD-HHMMSS`, `YYYY-MM-DD HH:MM`, and `YYYY-MM-DD HH:MM:SS`.

## Support

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/aceofspadesomelette)

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=AceOfSpadesOmelette/pagina&type=Date)](https://www.star-history.com/#AceOfSpadesOmelette/pagina&Date)
