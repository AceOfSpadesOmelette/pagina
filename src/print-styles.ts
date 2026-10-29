import "obsidian";

/**
 * Light-paper tokens. Dark-mode Obsidian leaves `--interactive-*` and
 * `--background-*` dark while Pagina forces near-black text, which paints
 * embedded controls (for example quiz buttons) black on black.
 * Keep these declarations in sync with styles.css.
 */
export const LIGHT_PRINT_SURFACE_VARS: Record<string, string> = {
	"--background-primary": "#ffffff",
	"--background-secondary": "#f2f3f5",
	"--background-modifier-border": "#d0d0d0",
	"--background-modifier-hover": "rgba(0, 0, 0, 0.06)",
	"--interactive-normal": "#f2f3f5",
	"--interactive-hover": "#e3e5e8",
	"--interactive-accent": "#4c6ef5",
	"--interactive-accent-hover": "#3b5bdb",
	"--text-on-accent": "#ffffff",
	"--text-normal": "#222222",
	"--text-muted": "#555555",
	"--text-faint": "#888888",
	"--h1-color": "var(--text-normal)",
	"--h2-color": "var(--text-normal)",
	"--h3-color": "var(--text-normal)",
	"--h4-color": "var(--text-normal)",
	"--h5-color": "var(--text-normal)",
	"--h6-color": "var(--text-normal)",
	"--bold-color": "var(--text-normal)",
	"--italic-color": "var(--text-normal)",
};

export const LIGHT_PRINT_SURFACE_CSS = Object.entries(LIGHT_PRINT_SURFACE_VARS)
	.map(([prop, value]) => `  ${prop}: ${value};`)
	.join("\n");

/**
 * Three-column cheat sheet. Keep this block in sync with styles.css.
 * These rules apply on screen (HTML preview) and in print (Chromium PDF).
 */
export const CHEAT_SHEET_CSS = `
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view {
  column-count: var(--pagina-cheat-columns, 3);
  column-gap: 4mm;
  column-fill: auto;
  font-size: var(--pagina-cheat-font-size, 8pt);
  line-height: 1.05;
  overflow-wrap: break-word;
  break-after: avoid-page;
  page-break-after: avoid;
  /* Drop Obsidian's reading-view file margins. They pad every column, with or without the title. */
  margin: 0 !important;
  padding: 0 !important;
}
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > :first-child,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__ + *,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__ + * > :first-child {
  margin-top: 0 !important;
}
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view :is(p, li, h1, h2, h3, h4, h5, h6, blockquote) {
  line-height: 1.05;
}
.print.pagina-print.pagina-cheat-sheet pre,
.print.pagina-print.pagina-cheat-sheet code {
  white-space: pre-wrap;
  word-break: break-word;
}
.print.pagina-print.pagina-cheat-sheet pre {
  margin-top: 0.6mm;
  margin-bottom: 0.6mm;
}
.print.pagina-print.pagina-cheat-sheet hr {
  margin: 0.6mm 0 !important;
}
.print.pagina-print.pagina-cheat-sheet pre,
.print.pagina-print.pagina-cheat-sheet .pagina-table-fit {
  break-inside: auto;
  page-break-inside: auto;
}
.print.pagina-print.pagina-cheat-sheet {
  --table-text-size: 1em;
}
.print.pagina-print.pagina-cheat-sheet :is(table, th, td) {
  font-size: 1em;
  line-height: 1.05;
}
.print.pagina-print.pagina-cheat-sheet :is(th, td) {
  padding: 1px 3px;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view :is(p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, .callout) {
  margin-top: 0;
  margin-bottom: 0;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view :is(ul, ol) {
  padding-left: 1.2em;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view p:empty,
.print.pagina-print.pagina-cheat-compact .markdown-preview-view p:has(> br:only-child) {
  display: none;
}
.print.pagina-print.pagina-cheat-sheet.pagina-uniform-text .markdown-preview-view :is(h1, h2, h3, h4, h5, h6) {
  font-size: 1em;
  font-weight: 700;
}
.print.pagina-print.pagina-cheat-sheet:not(.pagina-uniform-text) .markdown-preview-view h1 {
  font-size: 1.35em;
}
.print.pagina-print.pagina-cheat-sheet:not(.pagina-uniform-text) .markdown-preview-view h2 {
  font-size: 1.2em;
}
.print.pagina-print.pagina-cheat-sheet:not(.pagina-uniform-text) .markdown-preview-view h3 {
  font-size: 1.1em;
}
.print.pagina-print.pagina-cheat-sheet:not(.pagina-uniform-text) .markdown-preview-view :is(h4, h5, h6) {
  font-size: 1em;
  font-weight: 700;
}
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view h1.__title__ {
  font-family: inherit;
  text-align: center;
  margin: 0 0 1mm !important;
  line-height: 1.05;
  font-size: var(--pagina-cheat-font-size, 8pt);
}
.print.pagina-print.pagina-cheat-sheet:not(.pagina-uniform-text) .markdown-preview-view h1.__title__ {
  font-size: calc(var(--pagina-cheat-font-size, 8pt) * 1.35);
}
.print.pagina-print.pagina-cheat-sheet .pagina-continuous-run {
  margin: 0;
}
.print.pagina-print.pagina-cheat-sheet .pagina-run-heading {
  font-weight: 700;
}
`;

/**
 * Print rules for `.print.pagina-print`. Injected into the document and also
 * mirrored under @media print in styles.css for the native print-to-pdf pass.
 */
export const PRINT_CSS = `
.print.pagina-print {
  background: #ffffff;
  color: #222222;
${LIGHT_PRINT_SURFACE_CSS}
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print.pagina-print table {
  border-collapse: collapse;
  width: 100%;
  max-width: 100%;
  page-break-inside: auto;
}
.print.pagina-print table th,
.print.pagina-print table td {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.print.pagina-print table.pagina-table-compact th,
.print.pagina-print table.pagina-table-compact td {
  padding: 2px 4px;
}
.print.pagina-print .pagina-table-fit {
  max-width: 100%;
  overflow: hidden;
  page-break-inside: avoid;
}
.print.pagina-print thead {
  display: table-header-group;
}
.print.pagina-print tfoot {
  display: table-footer-group;
}
.print.pagina-print tr {
  page-break-inside: avoid;
}
.print.pagina-print img,
.print.pagina-print .image-embed,
.print.pagina-print svg,
.print.pagina-print video,
.print.pagina-print pre,
.print.pagina-print .mermaid,
.print.pagina-print .callout,
.print.pagina-print figure {
  page-break-inside: avoid;
  max-width: 100%;
}
.print.pagina-print img {
  height: auto;
}
.print.pagina-print [style*="text-align: center"] img,
.print.pagina-print [style*="text-align:center"] img,
.print.pagina-print .center img,
.print.pagina-print p[align="center"] img,
.print.pagina-print .image-embed.is-centered img,
.print.pagina-print .pagina-img-center {
  display: block;
  margin-left: auto;
  margin-right: auto;
}
.print.pagina-print .mermaid button,
.print.pagina-print .mermaid .clickable-icon,
.print.pagina-print .mermaid-icon,
.print.pagina-print .lightbox-trigger,
.print.pagina-print .mermaid-lumina-overlay,
.print.pagina-print .copy-code-button,
.print.pagina-print .edit-block-button {
  display: none;
}
.print.pagina-print pre:has(> .pagina-code-lang) {
  position: relative;
  padding-top: 1.15em;
}
.print.pagina-print .pagina-code-lang {
  position: absolute;
  top: 0;
  right: 0.4em;
  font-size: 0.85em;
  line-height: 1.15;
  font-weight: 700;
  color: #555555;
  pointer-events: none;
}
/* Obsidian's reading view uses margin: 2rem on hr. Keep a short break in print. */
.print.pagina-print hr {
  margin: 0.5rem 0 !important;
}
/* Body H1 only — never the file-name title or Conspectus TOC title. */
/* Skip the first body H1 so the optional file-name title is not left alone on a page. */
.print.pagina-print.pagina-break-h1 h1:not(.__title__):not(.conspectus-toc-title) ~ h1:not(.__title__):not(.conspectus-toc-title) {
  page-break-before: always;
}
.print.pagina-print.pagina-center-h1 h1:not(.__title__):not(.conspectus-toc-title) {
  text-align: center;
}
.print.pagina-print.pagina-underline-h1 h1:not(.__title__):not(.conspectus-toc-title) {
  text-decoration: underline;
}
.print.pagina-print .conspectus-toc.conspectus-toc-hide-export {
  display: none;
}
.print.pagina-print h1 > a.pagina-heading-toc-link,
.print.pagina-print h2 > a.pagina-heading-toc-link,
.print.pagina-print h3 > a.pagina-heading-toc-link,
.print.pagina-print h4 > a.pagina-heading-toc-link,
.print.pagina-print h5 > a.pagina-heading-toc-link,
.print.pagina-print h6 > a.pagina-heading-toc-link {
  color: inherit;
  text-decoration: none;
}
.print.pagina-print .conspectus-toc > ul.conspectus-toc-list {
  margin: 0;
  margin-inline-start: 0;
  padding: 0;
  padding-inline-start: 0;
  list-style: none;
}
.print.pagina-print .conspectus-toc a.internal-link {
  color: var(--link-color);
}
.print.pagina-print .conspectus-toc-entry {
  display: flex;
  align-items: baseline;
  width: 100%;
}
.print.pagina-print .conspectus-toc-leader {
  flex: 1 1 auto;
  border-bottom: 1px dotted currentColor;
  margin-bottom: 0.2em;
  margin-left: 0.35em;
}
.print.pagina-print .conspectus-toc-page {
  flex: 0 0 auto;
  margin-left: 0.5em;
  white-space: nowrap;
  text-align: right;
}
.print.pagina-print .conspectus-toc-entry:not(.conspectus-toc-leaders) > .conspectus-toc-page {
  margin-left: auto;
}
.print.pagina-print .pagina-forced-break {
  page-break-before: always;
  display: block;
  height: 0;
  margin: 0;
  padding: 0;
  border: none;
  visibility: hidden;
}
img.__canvas__ {
  width: 100%;
  height: auto;
}
${CHEAT_SHEET_CSS}
@media print {
  .print.pagina-print {
    visibility: visible;
    position: static;
    left: auto;
    top: auto;
    z-index: auto;
    background: #ffffff;
    color: #222222;
${LIGHT_PRINT_SURFACE_CSS}
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print .markdown-preview-view {
    height: auto;
  }
  .print.pagina-print thead {
    display: table-header-group;
  }
  .print.pagina-print tr,
  .print.pagina-print img,
  .print.pagina-print .mermaid,
  .print.pagina-print pre,
  .print.pagina-print .callout,
  .print.pagina-print .pagina-table-fit {
    page-break-inside: avoid;
  }
  .print.pagina-print.pagina-break-h1 h1:not(.__title__):not(.conspectus-toc-title) ~ h1:not(.__title__):not(.conspectus-toc-title) {
    page-break-before: always;
  }
  .print.pagina-print.pagina-center-h1 h1:not(.__title__):not(.conspectus-toc-title) {
    text-align: center;
  }
  .print.pagina-print.pagina-underline-h1 h1:not(.__title__):not(.conspectus-toc-title) {
    text-decoration: underline;
  }
  .print.pagina-print .conspectus-toc.conspectus-toc-hide-export {
    display: none;
  }
  .print.pagina-print h1 > a.pagina-heading-toc-link,
  .print.pagina-print h2 > a.pagina-heading-toc-link,
  .print.pagina-print h3 > a.pagina-heading-toc-link,
  .print.pagina-print h4 > a.pagina-heading-toc-link,
  .print.pagina-print h5 > a.pagina-heading-toc-link,
  .print.pagina-print h6 > a.pagina-heading-toc-link {
    color: inherit;
    text-decoration: none;
  }
  .print.pagina-print .conspectus-toc > ul.conspectus-toc-list {
    margin: 0;
    margin-inline-start: 0;
    padding: 0;
    padding-inline-start: 0;
    list-style: none;
  }
  .print.pagina-print .conspectus-toc a.internal-link {
    color: var(--link-color);
  }
  .print.pagina-print .conspectus-toc-entry {
    display: flex;
    align-items: baseline;
    width: 100%;
  }
  .print.pagina-print .conspectus-toc-leader {
    flex: 1 1 auto;
    border-bottom: 1px dotted currentColor;
    margin-bottom: 0.2em;
    margin-left: 0.35em;
  }
  .print.pagina-print .conspectus-toc-page {
    flex: 0 0 auto;
    margin-left: 0.5em;
    white-space: nowrap;
    text-align: right;
  }
  .print.pagina-print .conspectus-toc-entry:not(.conspectus-toc-leaders) > .conspectus-toc-page {
    margin-left: auto;
  }
  .print.pagina-print .pagina-forced-break {
    page-break-before: always;
    display: block;
    height: 0;
    margin: 0;
    padding: 0;
    border: none;
    visibility: hidden;
  }
}
`;

/** Remove Mermaid Lumina / viewer chrome that should not appear in the PDF. */
export function stripExportChrome(root: HTMLElement): void {
	const selectors = [
		".mermaid button",
		".mermaid .clickable-icon",
		".mermaid-icon",
		".lightbox-trigger",
		".mermaid-lumina-overlay",
		".copy-code-button",
		".edit-block-button",
		"button.clickable-icon",
	];
	for (const sel of selectors) {
		root.querySelectorAll(sel).forEach((el) => el.remove());
	}
}

const TABLE_FIT_SLOP_PX = 1;

function printableWidth(root: HTMLElement): number {
	return Math.max(1, root.clientWidth || root.offsetWidth);
}

function tableMinContentWidth(table: HTMLTableElement): number {
	const prevWidth = table.style.width;
	const prevMaxWidth = table.style.maxWidth;
	const full = table.classList.contains("pagina-table-full");
	const natural = table.classList.contains("pagina-table-natural");
	table.classList.remove("pagina-table-full", "pagina-table-natural");
	table.style.removeProperty("width");
	table.style.removeProperty("max-width");
	table.classList.add("pagina-table-min-content");
	void table.offsetWidth;
	const needed = Math.max(table.scrollWidth, table.offsetWidth);
	table.classList.remove("pagina-table-min-content");
	if (full) table.classList.add("pagina-table-full");
	if (natural) table.classList.add("pagina-table-natural");
	if (prevWidth) table.style.width = prevWidth;
	if (prevMaxWidth) table.style.maxWidth = prevMaxWidth;
	return needed;
}

function stretchTable(table: HTMLTableElement): void {
	table.style.removeProperty("width");
	table.style.removeProperty("max-width");
	table.classList.remove("pagina-table-natural");
	table.classList.add("pagina-table-full");
}

/** Slack so subpixel rounding does not wrap a header that essentially fits. */
const HEADER_LINE_SLOP_PX = 4;

/**
 * True when every measured header column can stay on one line inside `available`.
 * An empty list does not count as a fit.
 */
export function headerLineFits(widths: readonly number[], available: number): boolean {
	if (widths.length === 0) return false;
	let sum = 0;
	for (const width of widths) sum += width;
	return sum <= available + HEADER_LINE_SLOP_PX;
}

function parsePx(value: string): number {
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : 0;
}

/** Width of the cell's contents on one line, without the cell's own padding. */
function measureNowrapText(cell: HTMLElement): number {
	const doc = cell.ownerDocument;
	const host = doc.body;
	if (!host) return 0;
	const cs = getComputedStyle(cell);
	const probe = doc.createElement("span");
	probe.setCssProps({
		position: "absolute",
		left: "0",
		top: "0",
		visibility: "hidden",
		whiteSpace: "nowrap",
		display: "inline-block",
		width: "max-content",
		maxWidth: "none",
		margin: "0",
		padding: "0",
		border: "0",
	});
	probe.style.fontStyle = cs.fontStyle;
	probe.style.fontVariant = cs.fontVariant;
	probe.style.fontWeight = cs.fontWeight;
	probe.style.fontStretch = cs.fontStretch;
	probe.style.fontSize = cs.fontSize;
	probe.style.lineHeight = cs.lineHeight;
	probe.style.fontFamily = cs.fontFamily;
	probe.style.letterSpacing = cs.letterSpacing;
	probe.style.wordSpacing = cs.wordSpacing;
	probe.style.textTransform = cs.textTransform;
	for (const node of Array.from(cell.childNodes)) {
		probe.appendChild(node.cloneNode(true));
	}
	host.appendChild(probe);
	const width = probe.getBoundingClientRect().width;
	probe.remove();
	return width;
}

/**
 * `minWidth` is the value to assign under the cell's box-sizing.
 * `outerWidth` is the space that column needs in the table.
 */
function headerSingleLineWidth(cell: HTMLElement): { minWidth: number; outerWidth: number } {
	const cs = getComputedStyle(cell);
	const text = measureNowrapText(cell);
	const extra =
		parsePx(cs.paddingLeft) +
		parsePx(cs.paddingRight) +
		parsePx(cs.borderLeftWidth) +
		parsePx(cs.borderRightWidth);
	const outerWidth = Math.ceil(text + extra);
	const minWidth = cs.boxSizing === "border-box" ? outerWidth : Math.ceil(text);
	return { minWidth, outerWidth };
}

/** Header rows: every `thead` row, or the first row when it is all `th`. */
function headerRows(table: HTMLTableElement): HTMLTableRowElement[] {
	if (table.tHead && table.tHead.rows.length > 0) return Array.from(table.tHead.rows);
	const first = table.rows[0];
	if (!first || first.cells.length === 0) return [];
	for (const cell of first.cells) {
		if (cell.tagName !== "TH") return [];
	}
	return [first];
}

interface HeaderEntry {
	cell: HTMLTableCellElement;
	column: number;
	lockable: boolean;
	minWidth: number;
	outerWidth: number;
}

function headerEntries(table: HTMLTableElement, measuredWidths?: readonly number[]): HeaderEntry[] {
	const entries: HeaderEntry[] = [];
	let seen = 0;
	for (const row of headerRows(table)) {
		let column = 0;
		for (const cell of row.cells) {
			const span = cell.colSpan > 0 ? cell.colSpan : 1;
			if (cell.tagName === "TH") {
				const lockable = cell.colSpan === 1 && cell.querySelector("br") == null;
				const provided = measuredWidths?.[seen];
				seen += 1;
				let minWidth = 0;
				let outerWidth = 0;
				if (lockable) {
					if (provided != null) {
						minWidth = provided;
						outerWidth = provided;
					} else if (measuredWidths == null) {
						const measured = headerSingleLineWidth(cell);
						minWidth = measured.minWidth;
						outerWidth = measured.outerWidth;
					}
				}
				entries.push({ cell, column, lockable, minWidth, outerWidth });
			}
			column += span;
		}
	}
	return entries;
}

function lockHeaderCell(cell: HTMLElement, minWidth: number): void {
	cell.setCssProps({
		whiteSpace: "nowrap",
		overflowWrap: "normal",
		wordBreak: "normal",
	});
	cell.style.minWidth = `${minWidth}px`;
}

function wrapHeaderCell(cell: HTMLElement): void {
	cell.setCssProps({
		whiteSpace: "normal",
		overflowWrap: "break-word",
		wordBreak: "normal",
	});
	cell.style.removeProperty("min-width");
}

/**
 * Keep header cells on one line when that row fits in `availableWidth`.
 * Otherwise wrap them at spaces so a short word is not split.
 * A `br` or colspan is never forced onto one line.
 * Pass `measuredWidths` in header-cell order to skip layout measurement.
 * Tables with no header row are left unchanged.
 */
export function applyHeaderLinePreference(
	table: HTMLTableElement,
	availableWidth: number,
	measuredWidths?: readonly number[],
): void {
	const entries = headerEntries(table, measuredWidths);
	if (entries.length === 0) return;
	const columnWidth = new Map<number, number>();
	for (const entry of entries) {
		if (!entry.lockable) continue;
		const prev = columnWidth.get(entry.column) ?? 0;
		if (entry.outerWidth > prev) columnWidth.set(entry.column, entry.outerWidth);
	}
	const lock = headerLineFits([...columnWidth.values()], availableWidth);
	for (const entry of entries) {
		if (lock && entry.lockable) lockHeaderCell(entry.cell, entry.minWidth);
		else wrapHeaderCell(entry.cell);
	}
}

function preferSingleLineHeaders(table: HTMLTableElement, fallbackWidth: number): void {
	applyHeaderLinePreference(table, table.clientWidth || fallbackWidth);
}

/** `column-gap` on `.pagina-cheat-sheet` (see CHEAT_SHEET_CSS). */
const CHEAT_SHEET_COLUMN_GAP_MM = 4;
/** CSS pixels per millimetre at 96dpi, matching Chromium. */
const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Width of one cheat-sheet column inside a host `hostWidth` px wide.
 * Subtracts the same 4mm gap the cheat-sheet CSS inserts between columns.
 */
export function cheatSheetColumnWidth(hostWidth: number, columns: number): number {
	const count = Math.max(1, Math.floor(columns));
	const gapPx = CHEAT_SHEET_COLUMN_GAP_MM * CSS_PX_PER_MM;
	return Math.max(1, (hostWidth - gapPx * (count - 1)) / count);
}

/**
 * Cheat-sheet column count, or null when this export is not a cheat sheet.
 * The class and `--pagina-cheat-columns` live on the print host, not the preview.
 */
function cheatSheetColumnCount(root: HTMLElement): number | null {
	const sheet = root.closest(".pagina-cheat-sheet");
	if (!(sheet instanceof HTMLElement)) return null;
	const raw = sheet.style.getPropertyValue("--pagina-cheat-columns").trim();
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 1) return 3;
	return parsed;
}

/**
 * Keep every column of a wide table on the page by compacting padding, then
 * scaling only that table. Tables that can wrap stay at 100% and body size.
 * Header cells stay on one line when that row fits the fit budget.
 * A cheat sheet budgets one CSS column, not the full page, so a table cannot
 * paint into the next column.
 */
export function fitWideTables(root: HTMLElement): void {
	const hostWidth = printableWidth(root);
	const columns = cheatSheetColumnCount(root);
	const availableWidth = columns == null ? hostWidth : cheatSheetColumnWidth(hostWidth, columns);
	root.querySelectorAll("table").forEach((node) => {
		const table = node;
		if (table.closest(".pagina-table-fit")) return;

		stretchTable(table);
		void table.offsetWidth;
		if (columns == null) preferSingleLineHeaders(table, hostWidth);
		else applyHeaderLinePreference(table, availableWidth);

		let needed = tableMinContentWidth(table);
		if (needed <= availableWidth + TABLE_FIT_SLOP_PX) {
			stretchTable(table);
			return;
		}

		table.classList.add("pagina-table-compact");
		void table.offsetWidth;
		if (columns == null) preferSingleLineHeaders(table, hostWidth);
		else applyHeaderLinePreference(table, availableWidth);
		needed = tableMinContentWidth(table);
		if (needed <= availableWidth + TABLE_FIT_SLOP_PX) {
			stretchTable(table);
			return;
		}

		const scale = Math.min(1, availableWidth / needed);

		const wrap = createDiv({ cls: "pagina-table-fit" });
		wrap.style.width = `${needed}px`;
		// The column is narrower than this table's min-content. max-width: 100%
		// would clamp the pre-zoom width and then zoom would shrink it again.
		if (columns != null) wrap.setCssProps({ maxWidth: "none" });
		wrap.style.setProperty("zoom", String(scale));
		table.parentNode?.insertBefore(wrap, table);
		wrap.appendChild(table);
		table.style.width = `${needed}px`;
		table.classList.remove("pagina-table-full");
		table.classList.add("pagina-table-natural");
	});
}

/**
 * For the html2canvas raster path (CSS page breaks are ignored): push each
 * body H1 after the first to the top of the next page by inserting height spacers.
 * The first body H1 is skipped so it can stay with the optional file-name title.
 */
function insertBreakSpacerBefore(root: HTMLElement, el: HTMLElement, pageHeight: number): void {
	const offset =
		el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
	const posInPage = ((offset % pageHeight) + pageHeight) % pageHeight;
	if (posInPage < 1) return;
	const pad = pageHeight - posInPage;
	const spacer = createDiv({ cls: "pagina-h1-break pagina-break-spacer", attr: { "aria-hidden": "true" } });
	spacer.style.height = `${pad}px`;
	el.parentNode?.insertBefore(spacer, el);
	void root.offsetHeight;
}

export function insertH1PageBreakSpacers(root: HTMLElement, pageHeightPx: number): void {
	const pageHeight = Math.max(1, Math.ceil(pageHeightPx));
	const headings = Array.from(
		root.querySelectorAll<HTMLElement>("h1:not(.__title__):not(.conspectus-toc-title)"),
	);
	for (const h1 of headings.slice(1)) {
		insertBreakSpacerBefore(root, h1, pageHeight);
	}
}

function makeForcedBreak(): HTMLElement {
	const el = createDiv({ cls: "pagina-forced-break", attr: { "aria-hidden": "true" } });
	return el;
}

/**
 * Conspectus TOC print prep: hide export:false blocks and insert sibling
 * `.pagina-forced-break` markers (Chromium honors break-before on these reliably).
 * Idempotent — safe to call on preview refresh.
 */
export function prepareConspectusForPrint(root: HTMLElement): void {
	const tocs = Array.from(root.querySelectorAll<HTMLElement>(".conspectus-toc"));
	for (const toc of tocs) {
		if (toc.classList.contains("conspectus-toc-hide-export")) {
			// Drop any markers we previously attached around a now-hidden TOC.
			const prev = toc.previousElementSibling;
			if (prev?.classList.contains("pagina-forced-break")) prev.remove();
			const next = toc.nextElementSibling;
			if (next?.classList.contains("pagina-forced-break")) next.remove();
			continue;
		}

		if (toc.classList.contains("conspectus-toc-break-before")) {
			const prev = toc.previousElementSibling;
			if (!prev?.classList.contains("pagina-forced-break")) {
				toc.parentNode?.insertBefore(makeForcedBreak(), toc);
			}
		} else {
			const prev = toc.previousElementSibling;
			if (prev?.classList.contains("pagina-forced-break")) prev.remove();
		}

		if (toc.classList.contains("conspectus-toc-break-after")) {
			const next = toc.nextElementSibling;
			if (!next?.classList.contains("pagina-forced-break")) {
				toc.parentNode?.insertBefore(makeForcedBreak(), toc.nextSibling);
			}
		} else {
			const next = toc.nextElementSibling;
			if (next?.classList.contains("pagina-forced-break")) next.remove();
		}
	}
}

/** Raster fallback: pixel-pad before each `.pagina-forced-break` (CSS breaks ignored). */
export function insertForcedBreakSpacers(root: HTMLElement, pageHeightPx: number): void {
	const pageHeight = Math.max(1, Math.ceil(pageHeightPx));
	const markers = Array.from(root.querySelectorAll<HTMLElement>(".pagina-forced-break"));
	for (const marker of markers) {
		insertBreakSpacerBefore(root, marker, pageHeight);
	}
}

/** Center images whose container is centered, matching Reading view. */
export function centerAlignedImages(root: HTMLElement): void {
	root.querySelectorAll("img").forEach((img) => {
		const parent = img.parentElement;
		if (!parent) return;
		const align = getComputedStyle(parent).textAlign;
		const parentAlign = parent.getAttribute("align");
		if (align === "center" || parentAlign === "center" || parent.classList.contains("center")) {
			img.classList.add("pagina-img-center");
		}
	});
}
