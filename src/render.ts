import { App, Component, type FrontMatterCache, MarkdownRenderer, Platform, TFile } from "obsidian";
import { sanitizeCssText } from "./css-sanitize";
import { PRINT_CSS, centerAlignedImages, fitWideTables, stripExportChrome } from "./print-styles";

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

interface MermaidApi {
	run?: (opts: { nodes: ArrayLike<HTMLElement> }) => Promise<unknown> | unknown;
	init?: (cfg: unknown, nodes: HTMLElement | HTMLElement[] | NodeListOf<HTMLElement>) => Promise<unknown> | unknown;
}

function mermaidFences(el: HTMLElement): HTMLElement[] {
	const nodes = new Set<HTMLElement>();
	el.querySelectorAll("pre.language-mermaid, pre > code.language-mermaid, .language-mermaid").forEach((node) => {
		const host = node instanceof HTMLElement && node.tagName === "CODE" ? node.parentElement : node;
		if (host instanceof HTMLElement) nodes.add(host);
	});
	el.querySelectorAll(".mermaid").forEach((node) => {
		if (node instanceof HTMLElement) nodes.add(node);
	});
	return [...nodes];
}

function mermaidStillPending(el: HTMLElement): boolean {
	if (el.querySelector("pre.language-mermaid, pre > code.language-mermaid")) return true;
	return Array.from(el.querySelectorAll(".mermaid")).some((node) => !node.querySelector("svg"));
}

async function waitUntilMermaidReady(el: HTMLElement, timeout: number): Promise<void> {
	const start = Date.now();
	while (mermaidStillPending(el) && Date.now() - start < timeout) {
		await sleep(150);
	}
}

async function tryRunMermaid(el: HTMLElement): Promise<void> {
	const api = (window as unknown as { mermaid?: MermaidApi }).mermaid;
	if (!api) return;
	const nodes = mermaidFences(el);
	if (nodes.length === 0) return;
	try {
		if (typeof api.run === "function") {
			await Promise.resolve(api.run({ nodes }));
		} else if (typeof api.init === "function") {
			await Promise.resolve(api.init(undefined, nodes));
		}
	} catch (error) {
		console.error("Pagina: mermaid.render failed", error);
	}
}

export async function fixWaitRender(markdown: string, viewEl: HTMLElement): Promise<void> {
	const hasMermaid = /```\s*mermaid\b/i.test(markdown);
	if (
		markdown.includes("```dataview") ||
		markdown.includes("```gEvent") ||
		markdown.includes("![[") ||
		hasMermaid
	) {
		await sleep(hasMermaid && Platform.isMobile ? 400 : 1500);
	}
	await waitForDomChange(viewEl, hasMermaid && Platform.isMobile ? 4000 : 2000);
	if (hasMermaid || mermaidStillPending(viewEl)) {
		const timeout = Platform.isMobile ? 8000 : 3000;
		await waitUntilMermaidReady(viewEl, timeout);
		if (mermaidStillPending(viewEl)) {
			await tryRunMermaid(viewEl);
			await waitUntilMermaidReady(viewEl, timeout);
		}
	}
	await sleep(400);
}

function parkPrintHost(printEl: HTMLElement, widthPx: number): void {
	printEl.style.position = "absolute";
	printEl.style.left = "-10000px";
	printEl.style.top = "0";
	printEl.style.visibility = "visible";
	printEl.style.display = "block";
	printEl.style.zIndex = "-1";
	printEl.style.width = `${Math.max(1, Math.round(widthPx))}px`;
	printEl.style.height = "auto";
	printEl.style.overflow = "visible";
	printEl.style.pointerEvents = "none";
}

const MATH_COLOR_SEL = ".math, mjx-container, .katex";
const SVG_PAINT_SEL = "svg, path, use, rect, circle, ellipse, polygon, polyline, text, g";

function isPaintable(value: string | null): boolean {
	if (!value) return false;
	const v = value.trim().toLowerCase();
	return v !== "" && v !== "none" && v !== "transparent";
}

/**
 * MathJax/KaTeX paint glyphs with their own fill, so a wrapping
 * `<span style="color:…">` never reaches `$…$`. Copy inline color
 * (and background) onto those math nodes before print.
 */
export function preserveInlineColors(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
		const color = el.style.color;
		const background = el.style.backgroundColor;
		if (!color && !background) return;

		const maths = new Set<HTMLElement>();
		if (el.matches(MATH_COLOR_SEL)) maths.add(el);
		el.querySelectorAll<HTMLElement>(MATH_COLOR_SEL).forEach((node) => maths.add(node));

		for (const math of maths) {
			if (color) {
				math.style.color = color;
				math.querySelectorAll<HTMLElement>("*").forEach((child) => {
					if (!child.style.color) child.style.color = color;
				});
			}
			if (background) math.style.backgroundColor = background;
			if (!color) continue;
			math.querySelectorAll<Element>(SVG_PAINT_SEL).forEach((node) => {
				const fill = node.getAttribute("fill");
				const stroke = node.getAttribute("stroke");
				if (fill == null || isPaintable(fill)) {
					node.setAttribute("fill", color);
					if (node instanceof SVGElement) node.style.fill = color;
				}
				if (isPaintable(stroke)) {
					node.setAttribute("stroke", color);
					if (node instanceof SVGElement) node.style.stroke = color;
				}
			});
		}
	});
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

function markerIdFrom(value: string | null): string | null {
	if (!value) return null;
	const match = /url\(\s*['"]?#([^)'"]+)/.exec(value);
	return match?.[1] ?? null;
}

function attrNumber(el: Element, name: string, fallback: number): number {
	const raw = el.getAttribute(name);
	if (raw == null || raw === "") return fallback;
	const n = Number.parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}

function edgeTip(el: SVGGeometryElement, atEnd: boolean): { x: number; y: number; angle: number } | null {
	let len = 0;
	try {
		len = el.getTotalLength();
	} catch {
		return null;
	}
	if (!Number.isFinite(len) || len <= 0) return null;
	const delta = Math.min(2, len / 2);
	const tip = el.getPointAtLength(atEnd ? len : 0);
	const prev = el.getPointAtLength(atEnd ? Math.max(0, len - delta) : Math.min(len, delta));
	const dx = atEnd ? tip.x - prev.x : prev.x - tip.x;
	const dy = atEnd ? tip.y - prev.y : prev.y - tip.y;
	return { x: tip.x, y: tip.y, angle: Math.atan2(dy, dx) };
}

function placeMarker(
	svg: SVGSVGElement,
	edge: SVGGeometryElement,
	attr: "marker-end" | "marker-start",
): void {
	const id = markerIdFrom(edge.getAttribute(attr));
	if (!id) return;
	const marker = svg.querySelector(`marker[id="${CSS.escape(id)}"]`);
	if (!(marker instanceof SVGMarkerElement)) return;
	const atEnd = attr === "marker-end";
	const tip = edgeTip(edge, atEnd);
	if (!tip) return;

	const orient = (marker.getAttribute("orient") || "auto").trim();
	let angle = tip.angle;
	if (orient === "auto-start-reverse" && !atEnd) {
		angle += Math.PI;
	} else if (orient !== "auto" && orient !== "auto-start-reverse") {
		const deg = Number.parseFloat(orient);
		angle = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0;
	}

	const refX = attrNumber(marker, "refX", 0);
	const refY = attrNumber(marker, "refY", 0);
	const vb = marker.viewBox?.baseVal;
	const vbW = vb && vb.width > 0 ? vb.width : 0;
	const vbH = vb && vb.height > 0 ? vb.height : 0;
	const markerW = attrNumber(marker, "markerWidth", vbW || 3);
	const markerH = attrNumber(marker, "markerHeight", vbH || 3);
	const sx = vbW ? markerW / vbW : 1;
	const sy = vbH ? markerH / vbH : 1;
	const units = marker.getAttribute("markerUnits") || "strokeWidth";
	const strokeWidth =
		Number.parseFloat(edge.getAttribute("stroke-width") || "") ||
		Number.parseFloat(getComputedStyle(edge).strokeWidth) ||
		1;
	const unit = units === "userSpaceOnUse" ? 1 : strokeWidth;
	const deg = (angle * 180) / Math.PI;

	const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
	group.setAttribute("class", "pagina-arrowhead");
	group.setAttribute(
		"transform",
		`translate(${tip.x} ${tip.y}) rotate(${deg}) scale(${unit * sx} ${unit * sy}) translate(${-refX} ${-refY})`,
	);

	for (const child of Array.from(marker.children)) {
		const tag = child.tagName.toLowerCase();
		if (tag === "defs" || tag === "title" || tag === "desc") continue;
		const clone = child.cloneNode(true) as Element;
		if (clone instanceof SVGElement) {
			const painted = getComputedStyle(child);
			const edgePaint = getComputedStyle(edge);
			const fill = painted.fill && painted.fill !== "none" ? painted.fill : edgePaint.stroke || "#000";
			clone.setAttribute("fill", fill || "#000");
			if (painted.stroke && painted.stroke !== "none") clone.setAttribute("stroke", painted.stroke);
			clone.setAttribute("stroke-width", painted.strokeWidth || "1");
		}
		group.appendChild(clone);
	}
	if (!group.childElementCount) return;
	edge.parentNode?.appendChild(group);
	edge.removeAttribute(attr);
}

/** Chromium print drops SVG markers, so copy each arrowhead into ordinary geometry. */
export function materializeMermaidMarkers(root: HTMLElement): void {
	root.querySelectorAll(".mermaid svg").forEach((node) => {
		if (!(node instanceof SVGSVGElement)) return;
		node.style.overflow = "visible";
		const edges = Array.from(node.querySelectorAll("path, line"));
		for (const edge of edges) {
			if (!(edge instanceof SVGGeometryElement)) continue;
			if (edge.closest(".pagina-arrowhead")) continue;
			placeMarker(node, edge, "marker-end");
			placeMarker(node, edge, "marker-start");
		}
	});
}

const SVG_PAINT_PROPS = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "color", "font-family", "font-size", "font-weight"];

/** Copy computed paint onto each node so a standalone SVG snapshot matches the on-screen diagram. */
function inlineSvgPaint(svg: SVGSVGElement): void {
	const nodes = [svg, ...Array.from(svg.querySelectorAll("*"))];
	for (const node of nodes) {
		if (!(node instanceof SVGElement) && !(node instanceof HTMLElement)) continue;
		const computed = getComputedStyle(node);
		for (const prop of SVG_PAINT_PROPS) {
			const value = computed.getPropertyValue(prop);
			if (value) node.style.setProperty(prop, value);
		}
	}
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Mermaid snapshot failed"));
		img.src = url;
	});
}

/**
 * Bake each Mermaid SVG to a PNG after arrowheads are real geometry.
 * html2canvas skips SVG-as-image sources, so the bitmap is what the PDF captures.
 */
async function rasterizeSvgs(el: HTMLElement): Promise<void> {
	for (const node of Array.from(el.querySelectorAll(".mermaid svg"))) {
		if (!(node instanceof SVGSVGElement)) continue;
		let url = "";
		try {
			const rect = node.getBoundingClientRect();
			const width = Math.max(1, Math.ceil(rect.width || node.clientWidth));
			const height = Math.max(1, Math.ceil(rect.height || node.clientHeight));
			inlineSvgPaint(node);
			const clone = node.cloneNode(true) as SVGSVGElement;
			clone.setAttribute("width", String(width));
			clone.setAttribute("height", String(height));
			if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			const xml = new XMLSerializer().serializeToString(clone);
			url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
			const painted = await loadImage(url);
			const scale = 2;
			const canvas = document.createElement("canvas");
			canvas.width = width * scale;
			canvas.height = height * scale;
			const ctx = canvas.getContext("2d");
			if (!ctx) continue;
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(painted, 0, 0, canvas.width, canvas.height);
			const img = document.createElement("img");
			img.src = canvas.toDataURL("image/png");
			img.classList.add("__canvas__");
			img.style.width = `${width}px`;
			img.style.height = `${height}px`;
			img.width = width;
			img.height = height;
			node.replaceWith(img);
			canvas.width = 0;
			canvas.height = 0;
		} catch {
			/* keep svg */
		} finally {
			if (url) URL.revokeObjectURL(url);
		}
	}
}

const IMAGE_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), ms);
	try {
		return await fetch(url, { signal: controller.signal });
	} finally {
		window.clearTimeout(timer);
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
					const res = await fetchWithTimeout(src, IMAGE_FETCH_TIMEOUT_MS);
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

function registerHeadingKey(data: Map<string, string>, key: string, flag: string): void {
	if (!key) return;
	data.set(key, flag);
	data.set(encodeURIComponent(key), flag);
	data.set(key.replace(/\s+/g, "-"), flag);
	data.set(key.toLowerCase().replace(/\s+/g, "-"), flag);
	const cleanText = key.replace(/[^\w\s-]/g, "").trim();
	if (cleanText && cleanText !== key) {
		data.set(cleanText, flag);
		data.set(cleanText.replace(/\s+/g, "-"), flag);
		data.set(cleanText.toLowerCase().replace(/\s+/g, "-"), flag);
	}
}

/** Heading label without Ordinal Headings visual badge / empty af:// anchor text. */
function headingTextWithoutBadge(el: HTMLElement): string {
	const clone = el.cloneNode(true) as HTMLElement;
	clone.querySelectorAll(":scope > .ordinal-headings-label, :scope > .md-print-anchor").forEach((n) => n.remove());
	return (clone.textContent ?? "").trim();
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

		if (el.dataset.heading) {
			data.set(el.dataset.heading, flag);
			registerHeadingKey(data, el.dataset.heading, flag);
		}
		if (el.id) data.set(el.id, flag);

		const rawText = (el.textContent ?? "").trim();
		const cleaned = headingTextWithoutBadge(el);
		if (rawText) registerHeadingKey(data, rawText, flag);
		if (cleaned && cleaned !== rawText) registerHeadingKey(data, cleaned, flag);
		if (!rawText && !cleaned && !el.dataset.heading) return;
	});
	return data;
}

function headingsMatch(target: string, el: HTMLElement): boolean {
	const want = target.trim();
	if (!want) return false;
	const candidates = [
		el.dataset.heading ?? "",
		el.id ?? "",
		headingTextWithoutBadge(el),
		(el.textContent ?? "").trim(),
	];
	const wantLower = want.toLowerCase();
	for (const c of candidates) {
		if (!c) continue;
		if (c === want || c.toLowerCase() === wantLower) return true;
		if (safeDecode(c) === want || safeDecode(c).toLowerCase() === wantLower) return true;
	}
	return false;
}

/**
 * Wire Conspectus TOC entries directly to each heading's `af://` print flag.
 * Runs after addHeadingAnchors so md-print-anchor nodes exist.
 */
export function wireConspectusTocLinks(root: ParentNode): void {
	const headings = Array.from(
		root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
	).filter((el) => !el.classList.contains("conspectus-toc-title"));

	root.querySelectorAll<HTMLElement>(".conspectus-toc").forEach((toc) => {
		if (toc.classList.contains("conspectus-toc-hide-export")) return;
		toc.querySelectorAll<HTMLAnchorElement>("a[data-heading]").forEach((a) => {
			const key = (a.dataset.heading ?? a.textContent ?? "").trim();
			if (!key) return;
			const heading = headings.find((h) => headingsMatch(key, h));
			if (!heading) return;
			const printAnchor = heading.querySelector<HTMLAnchorElement>("a.md-print-anchor");
			const flag =
				printAnchor?.dataset.flag ||
				/^af:\/\/(.+)$/.exec(printAnchor?.getAttribute("href") ?? "")?.[1];
			if (!flag) return;
			a.setAttribute("href", `an://${flag}`);
		});
	});
}

function toLowerMap(map: Map<string, string>): Map<string, string> {
	return new Map(Array.from(map).map(([key, value]) => [key.toLowerCase(), value]));
}

function anchorLookupVariations(anchor: string): string[] {
	const decoded = safeDecode(anchor);
	return [
		anchor,
		decoded,
		anchor.replace(/-/g, " "),
		decoded.replace(/-/g, " "),
		anchor.toLowerCase(),
		decoded.toLowerCase(),
		anchor.toLowerCase().replace(/-/g, " "),
		decoded.toLowerCase().replace(/-/g, " "),
	];
}

function resolveAnchorFlag(
	dest: Map<string, string>,
	lowerDest: Map<string, string>,
	candidates: string[],
): string | undefined {
	for (const raw of candidates) {
		if (!raw) continue;
		for (const variation of anchorLookupVariations(raw)) {
			const flag = dest.get(variation) || lowerDest.get(variation.toLowerCase());
			if (flag) return flag;
		}
	}
	return undefined;
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
		if (anchor.startsWith("^")) return;

		const flag = resolveAnchorFlag(dest, lowerDest, [
			anchor,
			el.dataset.heading ?? "",
			(el.textContent ?? "").trim(),
		]);
		if (flag) el.setAttribute("href", `an://${flag}`);
	});

	root.querySelectorAll("a[href^='#']").forEach((node) => {
		const el = node as HTMLAnchorElement;
		if (el.classList.contains("internal-link")) return;
		const href = el.getAttribute("href");
		if (!href) return;
		const anchor = href.substring(1);
		if (!anchor || anchor.startsWith("^")) return;
		const flag = resolveAnchorFlag(dest, lowerDest, [
			anchor,
			el.dataset.heading ?? "",
			(el.textContent ?? "").trim(),
		]);
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
	/** Force a new page before each body H1 (CSS; excluded: file-name title). */
	pageBreakBeforeH1?: boolean;
	/** Center body H1s (excluded: file-name title). */
	centerH1?: boolean;
	/** Underline body H1s (excluded: file-name title). */
	underlineH1?: boolean;
	/** html2canvas fallback: inline images and attach a sanitized stylesheet. */
	forRaster?: boolean;
	/** WebView print: same inlined assets, but keep Mermaid as SVG. */
	forPrint?: boolean;
	/** When false, the raster fallback leaves Mermaid SVG in place. */
	bakeMermaid?: boolean;
	contentWidthPx?: number;
}

/** Apply body-H1 print style classes on the export host (never affects h1.__title__). */
export function applyH1StyleClasses(
	printEl: HTMLElement,
	opts: { pageBreakBeforeH1?: boolean; centerH1?: boolean; underlineH1?: boolean },
): void {
	printEl.toggleClass("pagina-break-h1", Boolean(opts.pageBreakBeforeH1));
	printEl.toggleClass("pagina-center-h1", Boolean(opts.centerH1));
	printEl.toggleClass("pagina-underline-h1", Boolean(opts.underlineH1));
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
	applyH1StyleClasses(printEl, opts);
	const hostWidth = opts.contentWidthPx ?? 800;
	parkPrintHost(printEl, hostWidth);
	if (opts.forRaster || opts.forPrint) {
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
	preserveInlineColors(viewEl);
	stripExportChrome(viewEl);
	centerAlignedImages(viewEl);
	fitWideTables(viewEl);
	fixCanvasToImage(viewEl);
	materializeMermaidMarkers(viewEl);
	if (opts.forRaster && opts.bakeMermaid !== false) {
		await rasterizeSvgs(viewEl);
	}
	if (opts.forRaster || opts.forPrint) {
		await inlineImages(viewEl, app);
	}

	const dest = addHeadingAnchors(viewEl);
	fixInternalAnchors(viewEl, dest, file.basename);
	wireConspectusTocLinks(viewEl);

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
