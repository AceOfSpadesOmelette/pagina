import "obsidian";

const UNSAFE_COLOR_FN =
	/\b(?:oklch|oklab|lab|lch|color-mix|color)\([^()]*(\([^()]*\)[^()]*)*\)/gi;

/** Replace modern CSS color functions html2canvas cannot parse. */
export function sanitizeCssText(css: string): string {
	let out = css;
	// Repeat to handle nested / repeated occurrences
	for (let i = 0; i < 5; i++) {
		const next = out.replace(UNSAFE_COLOR_FN, "#888888");
		if (next === out) break;
		out = next;
	}
	return out;
}

/**
 * In the html2canvas cloned document, drop live Obsidian stylesheets that contain
 * oklch() and keep only our sanitized export stylesheet.
 */
export function prepareCloneForCapture(clonedDoc: Document, printBackground: boolean): void {
	clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
		if (el.id === "pagina-export-styles") {
			if (el.instanceOf(HTMLStyleElement) && el.textContent) {
				el.textContent = sanitizeCssText(el.textContent);
			}
			return;
		}
		el.remove();
	});

	const root = clonedDoc.querySelector(".pagina-print");
	if (!root?.instanceOf(HTMLElement)) return;

	root.addClass("pagina-paper");

	if (!printBackground) {
		root.querySelectorAll("*").forEach((node) => {
			if (node.instanceOf(HTMLElement)) node.addClass("pagina-flat");
		});
	}
}
