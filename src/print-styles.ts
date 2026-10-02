/**
 * Print rules for `.print.pagina-print`. Injected into the document and also
 * mirrored under @media print in styles.css for the native print-to-pdf pass.
 */
export const PRINT_CSS = `
.print.pagina-print {
  background: #ffffff;
}
.print.pagina-print table {
  border-collapse: collapse;
  width: 100%;
  break-inside: auto;
  page-break-inside: auto;
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
img.__canvas__ {
  width: 100% !important;
  height: auto !important;
}
@media print {
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
  .print.pagina-print .callout {
    break-inside: avoid;
    page-break-inside: avoid;
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
