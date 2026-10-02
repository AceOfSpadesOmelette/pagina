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
			if (el instanceof HTMLStyleElement && el.textContent) {
				el.textContent = sanitizeCssText(el.textContent);
			}
			return;
		}
		el.remove();
	});

	const root = clonedDoc.querySelector(".pagina-print") as HTMLElement | null;
	if (!root) return;

	root.style.color = "#222222";
	root.style.background = "#ffffff";

	if (!printBackground) {
		root.querySelectorAll<HTMLElement>("*").forEach((el) => {
			el.style.background = "transparent";
			el.style.backgroundColor = "transparent";
			el.style.backgroundImage = "none";
			el.style.boxShadow = "none";
		});
		root.style.background = "#ffffff";
		root.style.backgroundColor = "#ffffff";
	}
}
