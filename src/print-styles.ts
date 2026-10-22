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
  break-inside: auto;
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
  padding: 2px 4px !important;
}
.print.pagina-print .pagina-table-fit {
  max-width: 100%;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}
.print.pagina-print thead {
  display: table-header-group;
}
.print.pagina-print tfoot {
  display: table-footer-group;
}
.print.pagina-print tr {
  break-inside: avoid;
  page-break-inside: avoid;
  break-after: auto;
}
.print.pagina-print img,
.print.pagina-print .image-embed,
.print.pagina-print svg,
.print.pagina-print video,
.print.pagina-print pre,
.print.pagina-print .mermaid,
.print.pagina-print .callout,
.print.pagina-print figure {
  break-inside: avoid;
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
  display: block !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.print.pagina-print .mermaid button,
.print.pagina-print .mermaid .clickable-icon,
.print.pagina-print .mermaid-icon,
.print.pagina-print .lightbox-trigger,
.print.pagina-print .mermaid-lumina-overlay,
.print.pagina-print .copy-code-button,
.print.pagina-print .edit-block-button {
  display: none !important;
}
/* Body H1 only — never the file-name title or Conspectus TOC title. */
/* Skip the first body H1 so the optional file-name title is not left alone on a page. */
.print.pagina-print.pagina-break-h1 h1:not(.__title__):not(.conspectus-toc-title) ~ h1:not(.__title__):not(.conspectus-toc-title) {
  break-before: page;
  page-break-before: always;
}
.print.pagina-print.pagina-center-h1 h1:not(.__title__):not(.conspectus-toc-title) {
  text-align: center;
}
.print.pagina-print.pagina-underline-h1 h1:not(.__title__):not(.conspectus-toc-title) {
  text-decoration: underline;
}
.print.pagina-print .conspectus-toc.conspectus-toc-hide-export {
  display: none !important;
}
.print.pagina-print .pagina-forced-break {
  break-before: page;
  page-break-before: always;
  display: block;
  height: 0;
  margin: 0;
  padding: 0;
  border: none;
  visibility: hidden;
}
img.__canvas__ {
  width: 100% !important;
  height: auto !important;
}
@media print {
  .print.pagina-print {
    visibility: visible !important;
    position: static !important;
    left: auto !important;
    top: auto !important;
    z-index: auto !important;
    background: #ffffff;
    color: #222222;
${LIGHT_PRINT_SURFACE_CSS}
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print .markdown-preview-view {
    height: auto !important;
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
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .print.pagina-print.pagina-break-h1 h1:not(.__title__):not(.conspectus-toc-title) ~ h1:not(.__title__):not(.conspectus-toc-title) {
    break-before: page;
    page-break-before: always;
  }
  .print.pagina-print.pagina-center-h1 h1:not(.__title__):not(.conspectus-toc-title) {
    text-align: center;
  }
  .print.pagina-print.pagina-underline-h1 h1:not(.__title__):not(.conspectus-toc-title) {
    text-decoration: underline;
  }
  .print.pagina-print .conspectus-toc.conspectus-toc-hide-export {
    display: none !important;
  }
  .print.pagina-print .pagina-forced-break {
    break-before: page;
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
	table.style.width = "min-content";
	table.style.maxWidth = "none";
	void table.offsetWidth;
	const needed = Math.max(table.scrollWidth, table.offsetWidth);
	table.style.width = prevWidth;
	table.style.maxWidth = prevMaxWidth;
	return needed;
}

function stretchTable(table: HTMLTableElement): void {
	table.style.width = "100%";
	table.style.maxWidth = "100%";
}

/**
 * Keep every column of a wide table on the page by compacting padding, then
 * scaling only that table. Tables that can wrap stay at 100% and body size.
 */
export function fitWideTables(root: HTMLElement): void {
	const hostWidth = printableWidth(root);
	root.querySelectorAll("table").forEach((node) => {
		const table = node as HTMLTableElement;
		if (table.closest(".pagina-table-fit")) return;

		stretchTable(table);
		void table.offsetWidth;

		let needed = tableMinContentWidth(table);
		if (needed <= hostWidth + TABLE_FIT_SLOP_PX) {
			stretchTable(table);
			return;
		}

		table.classList.add("pagina-table-compact");
		void table.offsetWidth;
		needed = tableMinContentWidth(table);
		if (needed <= hostWidth + TABLE_FIT_SLOP_PX) {
			stretchTable(table);
			return;
		}

		const scale = Math.min(1, hostWidth / needed);

		const wrap = document.createElement("div");
		wrap.className = "pagina-table-fit";
		wrap.style.overflow = "hidden";
		wrap.style.width = `${needed}px`;
		wrap.style.setProperty("zoom", String(scale));
		table.parentNode?.insertBefore(wrap, table);
		wrap.appendChild(table);
		table.style.width = `${needed}px`;
		table.style.maxWidth = "none";
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
	const spacer = document.createElement("div");
	spacer.className = "pagina-h1-break";
	spacer.setAttribute("aria-hidden", "true");
	spacer.style.height = `${pad}px`;
	spacer.style.width = "100%";
	spacer.style.margin = "0";
	spacer.style.padding = "0";
	spacer.style.border = "none";
	el.parentNode?.insertBefore(spacer, el);
	void root.offsetHeight;
}

export function insertH1PageBreakSpacers(root: HTMLElement, pageHeightPx: number): void {
	const pageHeight = Math.max(1, Math.ceil(pageHeightPx));
	const headings = Array.from(
		root.querySelectorAll("h1:not(.__title__):not(.conspectus-toc-title)"),
	) as HTMLElement[];
	for (const h1 of headings.slice(1)) {
		insertBreakSpacerBefore(root, h1, pageHeight);
	}
}

function makeForcedBreak(): HTMLElement {
	const el = document.createElement("div");
	el.className = "pagina-forced-break";
	el.setAttribute("aria-hidden", "true");
	return el;
}

/**
 * Conspectus TOC print prep: hide export:false blocks and insert sibling
 * `.pagina-forced-break` markers (Chromium honors break-before on these reliably).
 * Idempotent — safe to call on preview refresh.
 */
export function prepareConspectusForPrint(root: HTMLElement): void {
	const tocs = Array.from(root.querySelectorAll(".conspectus-toc")) as HTMLElement[];
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
	const markers = Array.from(root.querySelectorAll(".pagina-forced-break")) as HTMLElement[];
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
