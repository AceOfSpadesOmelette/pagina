import type { CheatSheetDensity } from "./types";
import { clampCheatSheetFontSize } from "./types";

export interface CheatSheetStyleInput {
	cheatSheet?: boolean;
	cheatSheetDensity?: CheatSheetDensity;
	cheatSheetFontSizePt?: number;
	cheatSheetUniformText?: boolean;
}

const PROTECTED =
	"pre, table, img, video, canvas, mjx-container, .math, .katex, .mermaid, figure, .image-embed, .internal-embed, hr";
const SKIP = "h1.__title__, .conspectus-toc";
const INLINE = "a, em, strong, b, i, code, span, mark, del, s, u, sub, sup, kbd, abbr";
const BLOCK = "p, div, li, ul, ol, blockquote, section, article, aside, header, footer";

function setClass(el: HTMLElement, cls: string, on: boolean): void {
	el.classList.toggle(cls, on);
}

/** Column, density, and type classes for the export host. */
export function applyCheatSheetClasses(printEl: HTMLElement, settings: CheatSheetStyleInput): void {
	const on = settings.cheatSheet === true;
	const continuous = on && settings.cheatSheetDensity === "continuous";
	setClass(printEl, "pagina-cheat-sheet", on);
	setClass(printEl, "pagina-cheat-compact", on && !continuous);
	setClass(printEl, "pagina-uniform-text", on && settings.cheatSheetUniformText !== false);
	if (on) {
		printEl.style.setProperty("--pagina-cheat-font-size", `${clampCheatSheetFontSize(settings.cheatSheetFontSizePt)}pt`);
	} else {
		printEl.style.removeProperty("--pagina-cheat-font-size");
	}
}

function isProtected(el: Element): boolean {
	return el.matches(PROTECTED) || el.matches(SKIP);
}

function isInline(el: Element): boolean {
	return el.matches(INLINE) && !el.querySelector(`${PROTECTED}, ${BLOCK}, h1, h2, h3, h4, h5, h6`);
}

function isBlock(el: Element): boolean {
	return el.matches(BLOCK);
}

function bucketHasContent(bucket: Node[]): boolean {
	return bucket.some((node) => {
		if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
		return node.nodeType === Node.ELEMENT_NODE;
	});
}

function collapseSpaces(el: HTMLElement): void {
	const texts: Text[] = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		texts.push(current as Text);
		current = walker.nextNode();
	}
	for (const text of texts) text.data = text.data.replace(/\s+/g, " ");
	if (texts[0]) texts[0].data = texts[0].data.replace(/^\s+/, "");
	const last = texts[texts.length - 1];
	if (last) last.data = last.data.replace(/\s+$/, "");
}

/**
 * Join the export copy into one run. Code, tables, images, math, and diagrams stay blocks.
 * Headings become bold labels in the run. Safe to call again.
 */
export function applyContinuousText(root: HTMLElement): void {
	if (root.dataset.paginaContinuous === "1") return;

	const produced: Node[] = [];
	const bucket: Node[] = [];

	const flush = () => {
		if (!bucketHasContent(bucket)) {
			bucket.length = 0;
			return;
		}
		const paragraph = document.createElement("p");
		paragraph.className = "pagina-continuous-run";
		while (bucket.length) {
			const node = bucket.shift();
			if (node) paragraph.appendChild(node);
		}
		collapseSpaces(paragraph);
		if (!paragraph.textContent?.trim()) return;
		produced.push(paragraph);
	};

	const appendText = (text: string) => {
		if (!text) return;
		bucket.push(document.createTextNode(text));
	};

	const absorb = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			appendText(node.textContent ?? "");
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = node as Element;
		if (isProtected(el)) {
			flush();
			produced.push(el);
			return;
		}
		if (el.tagName === "BR") {
			appendText(" ");
			return;
		}
		if (el.tagName === "INPUT" || el.tagName === "BUTTON" || el.tagName === "SCRIPT" || el.tagName === "STYLE") {
			return;
		}
		if (/^H[1-6]$/.test(el.tagName)) {
			const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
			if (!text) return;
			const strong = document.createElement("strong");
			strong.className = "pagina-run-heading";
			strong.textContent = text;
			bucket.push(strong);
			appendText(" ");
			return;
		}
		if (isInline(el)) {
			bucket.push(el);
			return;
		}
		if (el.tagName === "LI") appendText(" • ");
		for (const child of Array.from(el.childNodes)) absorb(child);
		if (isBlock(el)) appendText(" ");
	};

	for (const child of Array.from(root.childNodes)) absorb(child);
	flush();
	root.replaceChildren(...produced);
	root.dataset.paginaContinuous = "1";
}
