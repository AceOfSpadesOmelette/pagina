import { App, Component, type FrontMatterCache, MarkdownRenderer, TFile } from "obsidian";
import { sanitizeCssText } from "./css-sanitize";
import { PRINT_CSS, centerAlignedImages, stripExportChrome } from "./print-styles";

const LIGHT_PATCH_ID = "pagina-theme-light-patch";

function vaultConfig(app: App, key: string): unknown {
	return (app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.(key);
}

function cssclassesFrom(frontmatter: FrontMatterCache | Record<string, unknown>): string[] {
	const out: string[] = [];
	for (const [key, val] of Object.entries(frontmatter)) {
		if (key.toLowerCase() !== "cssclass" && key.toLowerCase() !== "cssclasses") continue;
		if (Array.isArray(val)) out.push(...val.map(String));
		else if (val != null) out.push(String(val));
	}
	return out;
}

/** Insert block-id spans so in-note `^block` links survive printing. */
function injectBlockIds(app: App, file: TFile, markdown: string): string {
	const cache = app.metadataCache.getFileCache(file);
	const blocks = new Map(Object.entries(cache?.blocks ?? {}));
	const lines = markdown.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		for (const { id, position } of blocks.values()) {
			const blockid = `^${id}`;
			if (line.includes(blockid) && i >= position.start.line && i <= position.end.line) {
				blocks.delete(id);
				lines[i] = line.replace(blockid, `<span id="${blockid}" class="blockid"></span> ${blockid}`);
				break;
			}
		}
	}
	for (const { id, position } of blocks.values()) {
		const idx = position.start.line;
		if (lines[idx] != null) {
			lines[idx] = `<span id="^${id}" class="blockid"></span>\n\n${lines[idx]}`;
		}
	}
	return lines.join("\n");
}

async function waitForDomChange(el: HTMLElement, timeout = 2000): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			resolve();
		};
		const observer = new MutationObserver(() => {
			window.clearTimeout(idleTimer);
			idleTimer = window.setTimeout(done, 250);
		});
		let idleTimer = window.setTimeout(done, 250);
		observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
		window.setTimeout(done, timeout);
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => window.setTimeout(r, ms));
}

export async function fixWaitRender(markdown: string, viewEl: HTMLElement): Promise<void> {
	if (
		markdown.includes("```dataview") ||
		markdown.includes("```gEvent") ||
		markdown.includes("![[") ||
		markdown.includes("```mermaid")
	) {
		await sleep(1500);
	}
	await waitForDomChange(viewEl);
	await sleep(400);
}

export function fixCanvasToImage(el: HTMLElement): void {
	for (const canvas of Array.from(el.querySelectorAll("canvas"))) {
		try {
			const data = canvas.toDataURL("image/png");
			const img = document.createElement("img");
			img.src = data;
			for (const attr of Array.from(canvas.attributes)) {
				if (attr.name === "width" || attr.name === "height" || attr.name === "style") {
					img.setAttribute(attr.name, attr.value);
				}
			}
			img.classList.add("__canvas__");
			canvas.replaceWith(img);
		} catch {
			/* tainted canvas */
		}
	}
}

function rasterizeSvgs(el: HTMLElement): void {
	for (const svg of Array.from(el.querySelectorAll(".mermaid svg"))) {
		try {
			const xml = new XMLSerializer().serializeToString(svg);
			const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
			const img = document.createElement("img");
			img.src = dataUrl;
			img.classList.add("__canvas__");
			svg.replaceWith(img);
		} catch {
			/* keep svg */
		}
	}
}

async function inlineImages(el: HTMLElement, app: App): Promise<void> {
	const imgs = Array.from(el.querySelectorAll("img"));
	await Promise.all(
		imgs.map(async (img) => {
			const src = img.getAttribute("src") ?? "";
			if (!src || src.startsWith("data:")) return;
			try {
				if (src.startsWith("app://") || src.startsWith("http://") || src.startsWith("https://")) {
					const res = await fetch(src);
					const blob = await res.blob();
					img.src = await blobToDataUrl(blob);
					return;
				}
			} catch {
				/* keep original */
			}
			try {
				const filePath = decodeURIComponent(src.split("?")[0] ?? src);
				const file = app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const data = await app.vault.readBinary(file);
					const mime = mimeFromExt(file.extension);
					img.src = `data:${mime};base64,${arrayBufferToBase64(data)}`;
				}
			} catch {
				/* keep original */
			}
		}),
	);
}

function mimeFromExt(ext: string): string {
	const e = ext.toLowerCase();
	if (e === "png") return "image/png";
	if (e === "jpg" || e === "jpeg") return "image/jpeg";
	if (e === "gif") return "image/gif";
	if (e === "webp") return "image/webp";
	if (e === "svg") return "image/svg+xml";
	return "application/octet-stream";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * Append invisible `af://` anchors Chromium records as link annotations.
 * Returns a map from heading text / id variants to the anchor flag.
 */
export function addHeadingAnchors(root: ParentNode): Map<string, string> {
	const data = new Map<string, string>();
	root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading, i) => {
		const el = heading as HTMLElement;
		const flag = `${el.tagName.toLowerCase()}-${i}`;
		const link = document.createElement("a");
		link.setAttribute("href", `af://${flag}`);
		link.className = "md-print-anchor";
		link.dataset.flag = flag;
		el.appendChild(link);

		if (el.dataset.heading) data.set(el.dataset.heading, flag);
		if (el.id) data.set(el.id, flag);

		const headingText = el.textContent?.trim() ?? "";
		if (!headingText) return;
		data.set(headingText, flag);
		data.set(encodeURIComponent(headingText), flag);
		data.set(headingText.replace(/\s+/g, "-"), flag);
		data.set(headingText.toLowerCase().replace(/\s+/g, "-"), flag);
		const cleanText = headingText.replace(/[^\w\s-]/g, "").trim();
		if (cleanText && cleanText !== headingText) {
			data.set(cleanText, flag);
			data.set(cleanText.replace(/\s+/g, "-"), flag);
			data.set(cleanText.toLowerCase().replace(/\s+/g, "-"), flag);
		}
	});
	return data;
}

function toLowerMap(map: Map<string, string>): Map<string, string> {
	return new Map(Array.from(map).map(([key, value]) => [key.toLowerCase(), value]));
}

/** Rewrite same-note heading links to `an://` so pdf-lib can turn them into GoTo dests. */
export function fixInternalAnchors(root: ParentNode, dest: Map<string, string>, basename: string): void {
	const lowerDest = toLowerMap(dest);

	root.querySelectorAll("a.internal-link").forEach((node) => {
		const el = node as HTMLAnchorElement;
		const [title, anchor] = el.dataset.href?.split("#") ?? [];
		if (anchor?.startsWith("^")) {
			const href = el.dataset.href?.toLowerCase();
			if (href) el.setAttribute("href", href);
		}
		if (!anchor || (title && title !== basename)) return;
		const flag = dest.get(anchor) || lowerDest.get(anchor.toLowerCase());
		if (flag && !anchor.startsWith("^")) {
			el.setAttribute("href", `an://${flag}`);
		}
	});

	root.querySelectorAll("a[href^='#']").forEach((node) => {
		const el = node as HTMLAnchorElement;
		if (el.classList.contains("internal-link")) return;
		const href = el.getAttribute("href");
		if (!href) return;
		const anchor = href.substring(1);
		if (!anchor || anchor.startsWith("^")) return;
		const variations = [
			anchor,
			safeDecode(anchor),
			anchor.replace(/-/g, " "),
			safeDecode(anchor).replace(/-/g, " "),
			anchor.toLowerCase(),
			safeDecode(anchor).toLowerCase(),
			anchor.toLowerCase().replace(/-/g, " "),
			safeDecode(anchor).toLowerCase().replace(/-/g, " "),
		];
		let flag: string | undefined;
		for (const variation of variations) {
			flag = dest.get(variation) || lowerDest.get(variation.toLowerCase());
			if (flag) break;
		}
		if (flag) el.setAttribute("href", `an://${flag}`);
	});
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * CSS variables declared as `var(...)` on body / .theme-dark that .theme-light never resets.
 * Re-declaring the formula under .print.theme-light lets callouts and tables pick up light colors.
 */
export function getDerivedLightVars(): Record<string, string> {
	const lightVars = new Set<string>();
	const derivedDarkVars: Record<string, string> = {};

	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		if (!rules) continue;
		for (const rule of Array.from(rules)) {
			if (!(rule instanceof CSSStyleRule)) continue;
			const selector = rule.selectorText ?? "";
			if (selector.includes(".theme-light")) {
				for (let i = 0; i < rule.style.length; i++) {
					const prop = rule.style.item(i);
					if (prop.startsWith("--")) lightVars.add(prop);
				}
			}
			if (selector.includes("body") || selector.includes(".theme-dark")) {
				for (let i = 0; i < rule.style.length; i++) {
					const prop = rule.style.item(i);
					if (!prop.startsWith("--")) continue;
					const rawVal = rule.style.getPropertyValue(prop).trim();
					if (rawVal.includes("var(")) derivedDarkVars[prop] = rawVal;
				}
			}
		}
	}

	const missing: Record<string, string> = {};
	for (const [prop, rawVal] of Object.entries(derivedDarkVars)) {
		if (!lightVars.has(prop)) missing[prop] = rawVal;
	}
	return missing;
}

export function injectLightVarsPatch(vars: Record<string, string>): void {
	document.getElementById(LIGHT_PATCH_ID)?.remove();
	if (!vars || Object.keys(vars).length === 0) return;
	const lines = Object.entries(vars).map(([prop, value]) => `${prop}: ${value};`);
	const style = document.createElement("style");
	style.id = LIGHT_PATCH_ID;
	style.textContent = `.print.theme-light {\n${lines.join("\n")}\n}`;
	document.head.appendChild(style);
}

export function removeLightVarsPatch(): void {
	document.getElementById(LIGHT_PATCH_ID)?.remove();
}

export function collectStyles(): string {
	const cssTexts: string[] = [];
	Array.from(document.styleSheets).forEach((sheet) => {
		const owner = sheet.ownerNode as HTMLElement | null;
		const id = owner?.id ?? "";
		if (id.startsWith("svelte-") || id.startsWith("pagina-")) return;
		try {
			Array.from(sheet.cssRules ?? []).forEach((rule) => {
				cssTexts.push(sanitizeCssText(rule.cssText));
			});
		} catch {
			/* cross-origin sheets */
		}
	});
	cssTexts.push(PRINT_CSS);
	return sanitizeCssText(cssTexts.join("\n"));
}

export interface RenderNoteOptions {
	app: App;
	file: TFile;
	includeTitle: boolean;
	/** html2canvas fallback: inline images and attach a sanitized stylesheet. */
	forRaster?: boolean;
	contentWidthPx?: number;
}

export interface RenderedNote {
	printEl: HTMLElement;
	contentEl: HTMLElement;
	frontmatter: FrontMatterCache;
	cleanup: () => void;
	component: Component;
}

/**
 * Render a note into `body > .print.theme-light > .markdown-preview-view`,
 * the structure Obsidian's print stylesheet and print-to-pdf expect.
 */
function ensurePrintStyle(): void {
	if (document.getElementById("pagina-print-css")) return;
	const style = document.createElement("style");
	style.id = "pagina-print-css";
	style.textContent = PRINT_CSS;
	document.head.appendChild(style);
}

export async function renderNoteForExport(opts: RenderNoteOptions): Promise<RenderedNote> {
	const { app, file, includeTitle } = opts;
	ensurePrintStyle();
	const raw = await app.vault.cachedRead(file);
	const markdown = injectBlockIds(app, file, raw);
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? ({} as FrontMatterCache);
	const component = new Component();
	component.load();

	const printEl = document.body.createDiv({ cls: "print theme-light pagina-print" });
	printEl.style.display = "none";
	if (opts.forRaster && opts.contentWidthPx) {
		printEl.style.width = `${Math.max(1, Math.round(opts.contentWidthPx))}px`;
		const styleEl = printEl.createEl("style", { attr: { id: "pagina-export-styles" } });
		styleEl.textContent = collectStyles();
	}

	const viewEl = printEl.createDiv({ cls: "markdown-preview-view markdown-rendered" });
	viewEl.addClasses(cssclassesFrom(frontmatter));
	viewEl.toggleClass("rtl", Boolean(vaultConfig(app, "rightToLeft")));
	viewEl.toggleClass("show-properties", vaultConfig(app, "propertiesInDocument") !== "hidden");

	const title = typeof frontmatter.title === "string" && frontmatter.title ? frontmatter.title : file.basename;
	viewEl.createEl("h1", { text: title }, (el) => {
		el.addClass("__title__");
		el.style.display = includeTitle ? "block" : "none";
	});

	await MarkdownRenderer.render(app, markdown, viewEl, file.path, component);

	viewEl.querySelectorAll("a.internal-link").forEach((node) => {
		const el = node as HTMLAnchorElement;
		const [linkTitle, anchor] = el.dataset.href?.split("#") ?? [];
		if ((!linkTitle || linkTitle === file.basename) && anchor?.startsWith("^")) return;
		el.removeAttribute("href");
	});

	await fixWaitRender(markdown, viewEl);
	stripExportChrome(viewEl);
	centerAlignedImages(viewEl);
	fixCanvasToImage(viewEl);
	if (opts.forRaster) {
		rasterizeSvgs(viewEl);
		await inlineImages(viewEl, app);
	}

	const dest = addHeadingAnchors(viewEl);
	fixInternalAnchors(viewEl, dest, file.basename);

	return {
		printEl,
		contentEl: viewEl,
		frontmatter,
		component,
		cleanup: () => {
			component.unload();
			printEl.remove();
		},
	};
}
