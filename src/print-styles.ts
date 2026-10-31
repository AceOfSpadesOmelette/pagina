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
  page-break-after: avoid;
  /* Drop Obsidian's reading-view file margins. They pad every column, with or without the title. */
  margin: 0;
  padding: 0;
}
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > :first-child,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__ + *,
.print.pagina-print.pagina-cheat-sheet .markdown-preview-view > h1.__title__ + * > :first-child {
  margin-top: 0;
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
  margin: 0.6mm 0;
}
.print.pagina-print.pagina-cheat-sheet pre,
.print.pagina-print.pagina-cheat-sheet .pagina-table-fit {
  page-break-inside: auto;
}
.print.pagina-print.pagina-cheat-sheet {
  --table-text-size: 1em;
}
.print.pagina-print.pagina-cheat-sheet :is(table, th, td) {
  font-size: 1em;
  line-height: 1.05;
}
.print.pagina-print.pagina-cheat-sheet table {
  table-layout: fixed;
  width: 100%;
  max-width: 100%;
}
.print.pagina-print.pagina-cheat-sheet :is(th, td) {
  padding: 1px 3px;
  min-width: 0;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}
.print.pagina-print.pagina-cheat-sheet :is(th, td) :is(img, svg, video, canvas, mjx-container, .katex, .math) {
  max-width: 100%;
  height: auto;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view :is(p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, .callout) {
  margin-top: 0;
  margin-bottom: 0;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view :is(ul, ol) {
  padding-left: 1.2em;
}
.print.pagina-print.pagina-cheat-compact .markdown-preview-view p:empty,
.print.pagina-print.pagina-cheat-compact .markdown-preview-view p.pagina-spacer-line {
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
  margin: 0 0 1mm;
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
.print.pagina-print table.pagina-table-fixed {
  table-layout: fixed;
}
.print.pagina-print table th,
.print.pagina-print table td {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
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
.print.pagina-print pre[data-pagina-code-lang="1"] {
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
  margin: 0.5rem 0;
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
  align-items: last baseline;
  column-gap: 4px;
  width: 100%;
}
.print.pagina-print .conspectus-toc-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}
.print.pagina-print .conspectus-toc-text > a {
  white-space: normal;
}
.print.pagina-print .conspectus-toc-leader {
  display: inline-block;
  width: 100%;
  height: 0;
  border-bottom: 1px dotted currentColor;
  margin-left: 0.35em;
  margin-right: calc(-100% - 0.35em);
  vertical-align: baseline;
}
.print.pagina-print .conspectus-toc-page {
  flex: 0 0 auto;
  white-space: nowrap;
  text-align: right;
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
    align-items: last baseline;
    column-gap: 4px;
    width: 100%;
  }
  .print.pagina-print .conspectus-toc-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }
  .print.pagina-print .conspectus-toc-text > a {
    white-space: normal;
  }
  .print.pagina-print .conspectus-toc-leader {
    display: inline-block;
    width: 100%;
    height: 0;
    border-bottom: 1px dotted currentColor;
    margin-left: 0.35em;
    margin-right: calc(-100% - 0.35em);
    vertical-align: baseline;
  }
  .print.pagina-print .conspectus-toc-page {
    flex: 0 0 auto;
    white-space: nowrap;
    text-align: right;
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
function measureNowrapText(cell: HTMLElement, word?: string): number {
	const doc = cell.ownerDocument;
	const host = doc.body;
	if (!host) return 0;
	const cs = getComputedStyle(cell);
	const probe = host.createSpan();
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
	if (word) keepLongestWord(probe, word);
	const width = probe.getBoundingClientRect().width;
	probe.remove();
	return width;
}

function longestWord(text: string): string {
	let longest = "";
	for (const word of text.split(/\s+/)) {
		if (word.length > longest.length) longest = word;
	}
	return longest;
}

/** Leave `word` in the text node that contained it, so bold or italic still applies. */
function keepLongestWord(root: HTMLElement, word: string): void {
	const texts: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		texts.push(current as Text);
		current = walker.nextNode();
	}
	const host = texts.find((text) => text.data.includes(word)) ?? texts[0];
	if (!host) {
		root.textContent = word;
		return;
	}
	for (const text of texts) text.data = text === host ? word : "";
}

function cellChromeWidth(cell: HTMLElement): number {
	const cs = getComputedStyle(cell);
	return (
		parsePx(cs.paddingLeft) +
		parsePx(cs.paddingRight) +
		parsePx(cs.borderLeftWidth) +
		parsePx(cs.borderRightWidth)
	);
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

/** Cheat-sheet cells wrap inside the column, including a long token. */
function wrapCheatSheetCell(cell: HTMLElement): void {
	cell.setCssProps({
		whiteSpace: "normal",
		overflowWrap: "break-word",
		wordBreak: "normal",
	});
	cell.style.removeProperty("min-width");
}

/**
 * No column share may start below this fraction of the table.
 * Renormalizing can leave the final share slightly under the floor.
 */
const CHEAT_SHEET_COLUMN_FLOOR = 0.08;

/**
 * Longest word in each column, plus the cell's horizontal padding.
 * A full sentence must not widen its column, or a short label is crushed to a few letters.
 * A colspan splits its width across the columns it covers. A rowspan occupies those columns
 * in the following rows so the next cell does not land on top of it.
 */
function columnContentWeights(table: HTMLTableElement): number[] {
	const rows = Array.from(table.rows);
	const occupied: boolean[][] = rows.map(() => []);
	const weights: number[] = [];
	const ensure = (count: number) => {
		while (weights.length < count) weights.push(0);
	};
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex];
		if (!row) continue;
		let column = 0;
		for (const cell of Array.from(row.cells)) {
			while (occupied[rowIndex]?.[column]) column += 1;
			const colSpan = cell.colSpan > 0 ? cell.colSpan : 1;
			const rowSpan = cell.rowSpan > 0 ? cell.rowSpan : 1;
			const word = longestWord(cell.textContent ?? "");
			const share = ((word ? measureNowrapText(cell, word) : 0) + cellChromeWidth(cell)) / colSpan;
			for (let offset = 0; offset < colSpan; offset++) {
				const index = column + offset;
				ensure(index + 1);
				if (share > (weights[index] ?? 0)) weights[index] = share;
				for (let down = 0; down < rowSpan && rowIndex + down < rows.length; down++) {
					const slot = occupied[rowIndex + down];
					if (slot) slot[index] = true;
				}
			}
			column += colSpan;
		}
	}
	return weights;
}

/** A label with no whitespace. A phrase, a paragraph, or a colspan is not one. */
function isSingleWord(text: string): boolean {
	return text.length > 0 && !/\s/.test(text);
}

/**
 * Full nowrap width and longest-word width of each column, plus cell padding.
 * `singleWord` is true when the cell that set that column's one-line width is a
 * single word. A colspan does not count. A rowspan occupies those columns in the
 * following rows so the next cell does not land on top of it.
 */
function columnSizeWeights(table: HTMLTableElement): {
	preferred: number[];
	floor: number[];
	singleWord: boolean[];
} {
	const rows = Array.from(table.rows);
	const occupied: boolean[][] = rows.map(() => []);
	const preferred: number[] = [];
	const floor: number[] = [];
	const singleWord: boolean[] = [];
	const ensure = (count: number) => {
		while (preferred.length < count) {
			preferred.push(0);
			floor.push(0);
			singleWord.push(false);
		}
	};
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex];
		if (!row) continue;
		let column = 0;
		for (const cell of Array.from(row.cells)) {
			while (occupied[rowIndex]?.[column]) column += 1;
			const colSpan = cell.colSpan > 0 ? cell.colSpan : 1;
			const rowSpan = cell.rowSpan > 0 ? cell.rowSpan : 1;
			const text = (cell.textContent ?? "").trim();
			const word = longestWord(text);
			const chrome = cellChromeWidth(cell);
			const fullShare = ((text ? measureNowrapText(cell) : 0) + chrome) / colSpan;
			const wordShare =
				((word ? measureNowrapText(cell, word) : 0) + chrome + HEADER_LINE_SLOP_PX) / colSpan;
			const wordCell = colSpan === 1 && isSingleWord(text);
			for (let offset = 0; offset < colSpan; offset++) {
				const index = column + offset;
				ensure(index + 1);
				if (fullShare > (preferred[index] ?? 0)) {
					preferred[index] = fullShare;
					singleWord[index] = wordCell;
				} else if (fullShare > 0 && fullShare === (preferred[index] ?? 0) && !wordCell) {
					singleWord[index] = false;
				}
				if (wordShare > (floor[index] ?? 0)) floor[index] = wordShare;
				for (let down = 0; down < rowSpan && rowIndex + down < rows.length; down++) {
					const slot = occupied[rowIndex + down];
					if (slot) slot[index] = true;
				}
			}
			column += colSpan;
		}
	}
	return { preferred, floor, singleWord };
}

/**
 * Percent widths for a normal-mode table.
 * When every column fits on one line, each keeps that width and leftover is
 * shared by content. Otherwise only a single-word column keeps one line.
 * Phrases and paragraphs split what remains by their one-line text, and none
 * drops below its longest word.
 */
function readingColumnPercents(
	preferred: readonly number[],
	floor: readonly number[],
	singleWord: readonly boolean[],
	available: number,
): number[] {
	const count = preferred.length;
	if (count === 0) return [];
	const prefs = preferred.map((value, index) => Math.max(0, value, floor[index] ?? 0));
	const floors = prefs.map((value, index) => Math.min(value, Math.max(0, floor[index] ?? 0)));
	const prefSum = prefs.reduce((sum, value) => sum + value, 0);
	if (!(available > 0) || !(prefSum > 0)) return Array.from({ length: count }, () => 100 / count);

	const floorSum = floors.reduce((sum, value) => sum + value, 0);
	if (floorSum >= available) return toPercents(scaleTo(floors, available));

	if (prefSum <= available + 0.5) {
		const leftover = Math.max(0, available - prefSum);
		if (leftover <= 0) return toPercents(prefs);
		return toPercents(prefs.map((value) => value + (leftover * value) / prefSum));
	}

	const locked = new Array<boolean>(count).fill(false);
	const order = prefs
		.map((_, index) => index)
		.sort((a, b) => (prefs[a] ?? 0) - (prefs[b] ?? 0) || a - b);
	for (const index of order) {
		if (!singleWord[index]) continue;
		let lockedSum = 0;
		let otherFloors = 0;
		for (let i = 0; i < count; i++) {
			if (locked[i]) lockedSum += prefs[i] ?? 0;
			else if (i !== index) otherFloors += floors[i] ?? 0;
		}
		if (lockedSum + (prefs[index] ?? 0) + otherFloors <= available + 0.5) locked[index] = true;
	}

	const widths = new Array<number>(count).fill(0);
	let lockedWidth = 0;
	const unlocked: number[] = [];
	for (let i = 0; i < count; i++) {
		if (locked[i]) {
			widths[i] = prefs[i] ?? 0;
			lockedWidth += prefs[i] ?? 0;
		} else {
			unlocked.push(i);
		}
	}
	const rest = Math.max(0, available - lockedWidth);
	const shared = shareAboveFloors(
		unlocked.map((index) => prefs[index] ?? 0),
		unlocked.map((index) => floors[index] ?? 0),
		rest,
	);
	for (let i = 0; i < unlocked.length; i++) widths[unlocked[i] ?? 0] = shared[i] ?? 0;
	return toPercents(widths);
}

/** Give each column its floor, then share leftover in proportion to one-line text. */
function shareAboveFloors(prefs: readonly number[], floors: readonly number[], budget: number): number[] {
	const count = prefs.length;
	if (count === 0) return [];
	const base = floors.map((value) => Math.max(0, value));
	const baseSum = base.reduce((sum, value) => sum + value, 0);
	if (!(budget > 0)) return base.map(() => 0);
	if (baseSum >= budget) return scaleTo(base, budget);
	const leftover = budget - baseSum;
	const prefSum = prefs.reduce((sum, value) => sum + Math.max(0, value), 0);
	if (!(prefSum > 0)) {
		const share = leftover / count;
		return base.map((value) => value + share);
	}
	return base.map((value, index) => value + (leftover * Math.max(0, prefs[index] ?? 0)) / prefSum);
}

function scaleTo(values: readonly number[], available: number): number[] {
	const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
	if (!(total > 0)) return values.map(() => available / Math.max(1, values.length));
	return values.map((value) => (Math.max(0, value) / total) * available);
}

function toPercents(widths: readonly number[]): number[] {
	const total = widths.reduce((sum, value) => sum + Math.max(0, value), 0);
	if (!(total > 0)) return widths.map(() => 100 / Math.max(1, widths.length));
	return widths.map((value) => (Math.max(0, value) / total) * 100);
}

/** Percent widths that sum to 100. Equal shares when nothing could be measured. */
function columnPercents(weights: readonly number[]): number[] {
	const count = weights.length;
	if (count === 0) return [];
	const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
	if (!(total > 0)) return Array.from({ length: count }, () => 100 / count);
	const floor = Math.min(CHEAT_SHEET_COLUMN_FLOOR, 1 / count);
	const lifted = weights.map((weight) => Math.max(Math.max(0, weight) / total, floor));
	const liftedSum = lifted.reduce((sum, share) => sum + share, 0);
	return lifted.map((share) => (share / liftedSum) * 100);
}

function formatColumnWidths(percents: readonly number[]): string[] {
	if (percents.length === 0) return [];
	const rounded = percents.map((percent) => Math.round(percent * 1000) / 1000);
	const drift = Math.round((100 - rounded.reduce((sum, value) => sum + value, 0)) * 1000) / 1000;
	const last = rounded.length - 1;
	rounded[last] = Math.round(((rounded[last] ?? 0) + drift) * 1000) / 1000;
	return rounded.map((value) => `${value}%`);
}

function replaceColumnGroup(table: HTMLTableElement, widths: readonly string[]): void {
	table.querySelectorAll("colgroup.pagina-table-cols").forEach((node) => node.remove());
	if (widths.length === 0) return;
	const group = createEl("colgroup", { cls: "pagina-table-cols" });
	for (const width of widths) {
		const col = createEl("col");
		col.style.width = width;
		group.appendChild(col);
	}
	table.insertBefore(group, table.firstChild);
}

/**
 * Pin a cheat-sheet table to the CSS column. Works for 2, 3, and 4 columns:
 * `width: 100%` with `table-layout: fixed` follows the column box, whatever the count,
 * so the table cannot paint into the next cheat-sheet column.
 */
function pinCheatSheetTable(table: HTMLTableElement): void {
	for (const cell of table.querySelectorAll<HTMLTableCellElement>("th, td")) {
		wrapCheatSheetCell(cell);
	}
	replaceColumnGroup(table, formatColumnWidths(columnPercents(columnContentWeights(table))));
	stretchTable(table);
	table.classList.add("pagina-table-fixed");
}

/** One extra pixel so subpixel rounding does not wrap the last glyph. */
const WORD_DEFICIT_EXTRA_PX = 1;

/**
 * Give a column that is still short of its longest word the missing pixels.
 * Those pixels come from the other column furthest above its longest-word floor.
 * A column that is itself short, or already on its floor, is not a donor.
 * The total width stays the same.
 */
export function shiftWordDeficits(
	widths: readonly number[],
	deficits: readonly number[],
	floors: readonly number[],
): number[] {
	const next = widths.map((value) => Math.max(0, value));
	const count = next.length;
	for (let index = 0; index < count; index++) {
		const deficit = deficits[index] ?? 0;
		if (!(deficit > 0)) continue;
		let donor = -1;
		let spare = 0;
		for (let other = 0; other < count; other++) {
			if (other === index || (deficits[other] ?? 0) > 0) continue;
			const room = (next[other] ?? 0) - Math.max(0, floors[other] ?? 0);
			if (room > spare) {
				spare = room;
				donor = other;
			}
		}
		if (donor < 0) continue;
		const move = Math.min(deficit, spare);
		next[index] = (next[index] ?? 0) + move;
		next[donor] = (next[donor] ?? 0) - move;
	}
	return next;
}

/**
 * How many pixels each column is still short of its longest word, plus one.
 * Compared with the cell content box after the columns have been applied.
 * A colspan is skipped. A zero `clientWidth` means the cell was not laid out.
 * Returns null when nothing was laid out, so a headless test does not invent a deficit.
 */
function columnWordDeficits(table: HTMLTableElement, columnCount: number): number[] | null {
	if (columnCount === 0) return null;
	const deficits = new Array<number>(columnCount).fill(0);
	let measured = false;
	const rows = Array.from(table.rows);
	const occupied: boolean[][] = rows.map(() => []);
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex];
		if (!row) continue;
		let column = 0;
		for (const cell of Array.from(row.cells)) {
			while (occupied[rowIndex]?.[column]) column += 1;
			const colSpan = cell.colSpan > 0 ? cell.colSpan : 1;
			const rowSpan = cell.rowSpan > 0 ? cell.rowSpan : 1;
			if (colSpan === 1 && column < columnCount) {
				const box = cell.clientWidth;
				if (box > 0) {
					measured = true;
					const cs = getComputedStyle(cell);
					const content = Math.max(0, box - parsePx(cs.paddingLeft) - parsePx(cs.paddingRight));
					const word = longestWord((cell.textContent ?? "").trim());
					const wordWidth = word ? measureNowrapText(cell, word) : 0;
					if (wordWidth > content) {
						const shortfall = wordWidth - content + WORD_DEFICIT_EXTRA_PX;
						if (shortfall > (deficits[column] ?? 0)) deficits[column] = shortfall;
					}
				}
			}
			for (let offset = 0; offset < colSpan; offset++) {
				for (let down = 0; down < rowSpan && rowIndex + down < rows.length; down++) {
					const slot = occupied[rowIndex + down];
					if (slot) slot[column + offset] = true;
				}
			}
			column += colSpan;
		}
	}
	return measured ? deficits : null;
}

function columnSharePixels(table: HTMLTableElement, layoutWidth: number): number[] {
	return [...table.querySelectorAll("col")].map((col) => {
		const share = Number.parseFloat(col.style.width);
		return Number.isFinite(share) ? (share / 100) * layoutWidth : 0;
	});
}

/** Wrap a header whose column is still narrower than the single-line label. */
function wrapTightHeaders(table: HTMLTableElement, layoutWidth: number): void {
	preferSingleLineHeaders(table, layoutWidth);
	const shares = [...table.querySelectorAll("col")].map((col) => Number.parseFloat(col.style.width));
	for (const entry of headerEntries(table)) {
		const share = shares[entry.column];
		if (!entry.lockable || share == null || !Number.isFinite(share)) continue;
		const columnWidth = (share / 100) * layoutWidth;
		if (entry.outerWidth > columnWidth + HEADER_LINE_SLOP_PX) wrapHeaderCell(entry.cell);
	}
}

/**
 * Size a normal-mode table from the full nowrap width of each column.
 * Percents use the table's own width. The preview box is wider by its padding,
 * and a percent of that wider box leaves the cell about a glyph short.
 */
function pinReadingTable(table: HTMLTableElement, availableWidth: number): void {
	void table.offsetWidth;
	const layoutWidth = table.clientWidth > 0 ? table.clientWidth : availableWidth;
	const { preferred, floor, singleWord } = columnSizeWeights(table);
	replaceColumnGroup(
		table,
		formatColumnWidths(readingColumnPercents(preferred, floor, singleWord, layoutWidth)),
	);
	stretchTable(table);
	table.classList.add("pagina-table-fixed");
	wrapTightHeaders(table, layoutWidth);
	void table.offsetWidth;
	const shares = columnSharePixels(table, layoutWidth);
	const deficits = columnWordDeficits(table, shares.length);
	if (!deficits || !deficits.some((value) => value > 0)) return;
	const shifted = shiftWordDeficits(shares, deficits, floor);
	replaceColumnGroup(table, formatColumnWidths(toPercents(shifted)));
	wrapTightHeaders(table, layoutWidth);
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
 * A cheat sheet (2, 3, or 4 columns) pins each table to its CSS column instead.
 * Zoom leaves the pre-zoom box in a multi-column layout, so it cannot be used there.
 */
export function fitWideTables(root: HTMLElement): void {
	if (cheatSheetColumnCount(root) != null) {
		root.querySelectorAll("table").forEach((table) => {
			if (table.closest(".pagina-table-fit")) return;
			pinCheatSheetTable(table);
		});
		return;
	}

	const hostWidth = printableWidth(root);
	root.querySelectorAll("table").forEach((table) => {
		if (table.closest(".pagina-table-fit")) return;

		stretchTable(table);
		void table.offsetWidth;
		preferSingleLineHeaders(table, hostWidth);

		let needed = tableMinContentWidth(table);
		if (needed <= hostWidth + TABLE_FIT_SLOP_PX) {
			pinReadingTable(table, hostWidth);
			return;
		}

		table.classList.add("pagina-table-compact");
		void table.offsetWidth;
		preferSingleLineHeaders(table, hostWidth);
		needed = tableMinContentWidth(table);
		if (needed <= hostWidth + TABLE_FIT_SLOP_PX) {
			stretchTable(table);
			return;
		}

		const scale = Math.min(1, hostWidth / needed);

		const wrap = createDiv({ cls: "pagina-table-fit" });
		wrap.style.width = `${needed}px`;
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
