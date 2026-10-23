# Pagina

Export the open note to PDF on desktop. You can set the page size, margins, headers, and footers.

Export is desktop only. Mobile export is turned off until it is reliable.

Open a note, then use the ribbon icon **Pagina: Export to PDF**, the command **Export current note to PDF**, or **Export to PDF (pagina)** in the file menu or the editor menu. On desktop, Pagina can open a Save dialog.

The export window previews the note as the page or as PDF pages. The page is light, and text and controls are adjusted so they stay readable when Obsidian is in dark mode.

## What you can set

Open **Settings → Pagina**, or change the same options in the export window.

- Page size, portrait or landscape, margins, and downscale. Portrait is the default.
- Exam cheat sheet: landscape and three columns per page. Compact keeps each line and tightens the spacing. Continuous joins the note into one run, except code, tables, images, math, and diagrams. Text size is in points, and headings can use that same size. Page size, margins, headers, and footers stay as you set them. Downscale still scales the whole page.
- The file name as a title at the top of the export
- Whether Heading 1 starts a new page, and whether it is centered or underlined
- A header and a footer, each with left, center, and right text
- Border style and color for the header and footer
- Font and text color. A blank font uses the vault’s text font, including a font installed for the vault.
- PDF preview, printed backgrounds, the outline, metadata, and a timestamp on the file name
- Whether to open the PDF after export

Under **Backup**, **Export settings** and **Import settings** save or restore that configuration as `pagina-settings.json`.

## Header and footer tokens

| Token | Result |
| --- | --- |
| `{{title}}` | Note name |
| `{{filename}}` | File name |
| `{{page}}` | Current page |
| `{{pages}}` | Page count |
| `{{date}}`, `{{time}}`, `{{datetime}}` | Local date and time |
| `{{datetime:YYYY-MM-DD}}` | A chosen format |
| `{{property:key}}` | A property from the note’s properties |

Date formats include `EPOCH`, `YYYYMMDD`, `YYYY-MM-DD`, `YYYYMMDD-HHMMSS`, `YYYY-MM-DD HH:MM`, and `YYYY-MM-DD HH:MM:SS`.

## Support

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/aceofspadesomelette)

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=AceOfSpadesOmelette/pagina&type=Date)](https://www.star-history.com/#AceOfSpadesOmelette/pagina&Date)
