import "obsidian";

/**
 * Note image sizes such as `![[file.png|1000]]` and the printable content box.
 * Requested pixels are stamped on the rendered embed, then scaled down to fit.
 */

const REQ_WIDTH = "data-pagina-req-width";
const REQ_HEIGHT = "data-pagina-req-height";

const IMAGE_PATTERN =
	/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

const SIZE_PATTERN = /^(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/;

export interface ImageRequest {
	src: string;
	width?: number;
	height?: number;
}

export interface ImageBox {
	width: number;
	height: number;
}

/** Wiki and markdown image references in note order. A pipe token counts only when it is `N` or `NxN`. */
export function parseImageRequests(markdown: string): ImageRequest[] {
	const requests: ImageRequest[] = [];
	const pattern = new RegExp(IMAGE_PATTERN.source, "g");
	for (const match of maskNonBody(markdown).matchAll(pattern)) {
		const wikiPath = match[1];
		const wikiAlias = match[2];
		const mdAlt = match[3];
		const mdSrc = match[4];
		if (wikiPath) {
			requests.push({ src: wikiPath.trim(), ...parseSizeToken(wikiAlias) });
			continue;
		}
		if (mdSrc) {
			requests.push({ src: mdSrc.trim(), ...parseSizeToken(sizeTokenFromAlt(mdAlt ?? "")) });
		}
	}
	return requests;
}

/**
 * Write the note's requested pixel size onto each rendered image.
 * Pairing follows embed `src` order, so two embeds of one file can differ.
 * An image with no size keeps the attributes empty and later uses its natural size.
 */
export function stampImageRequests(root: ParentNode, markdown: string): void {
	const queues = new Map<string, ImageRequest[]>();
	for (const request of parseImageRequests(markdown)) {
		const key = normalizeImageSrc(request.src);
		if (!key) continue;
		const list = queues.get(key);
		if (list) list.push(request);
		else queues.set(key, [request]);
	}

	for (const el of imageTargets(root)) {
		const request = takeRequest(queues, elementSrc(el));
		if (request?.width != null && request.width > 0) {
			el.setAttribute(REQ_WIDTH, String(request.width));
			if (request.height != null && request.height > 0) {
				el.setAttribute(REQ_HEIGHT, String(request.height));
			} else {
				el.removeAttribute(REQ_HEIGHT);
			}
		} else {
			el.removeAttribute(REQ_WIDTH);
			el.removeAttribute(REQ_HEIGHT);
		}
	}
}

/** Largest size that stays inside the box without growing past the request. */
export function fitImageBox(requested: ImageBox, maxWidth: number, maxHeight: number): ImageBox {
	const { width, height } = requested;
	if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
	if (!(maxWidth > 0) || !(maxHeight > 0)) return { width, height };
	const scale = Math.min(1, maxWidth / width, maxHeight / height);
	return { width: width * scale, height: height * scale };
}

/**
 * Apply stamped sizes, then shrink anything taller or wider than the content box.
 * Width-only requests keep the image's aspect ratio. `WxH` keeps that exact ratio.
 */
export async function fitStampedImages(root: ParentNode, maxWidth: number, maxHeight: number): Promise<void> {
	if (!(maxWidth > 0) || !(maxHeight > 0)) return;
	const targets = imageTargets(root);
	await Promise.all(targets.map((el) => fitOne(el, maxWidth, maxHeight)));
}

function maskNonBody(markdown: string): string {
	let text = markdown;
	if (text.startsWith("---")) {
		const end = text.indexOf("\n---", 3);
		if (end >= 0) {
			const lineEnd = text.indexOf("\n", end + 1);
			const cut = lineEnd >= 0 ? lineEnd + 1 : end + 4;
			text = " ".repeat(cut) + text.slice(cut);
		}
	}
	return text
		.replace(/```[\s\S]*?```/g, (block) => " ".repeat(block.length))
		.replace(/~~~[\s\S]*?~~~/g, (block) => " ".repeat(block.length))
		.replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length));
}

function parseSizeToken(token: string | undefined): { width?: number; height?: number } {
	if (!token) return {};
	const match = SIZE_PATTERN.exec(token.trim());
	if (!match) return {};
	const width = Number(match[1]);
	if (!Number.isFinite(width) || width <= 0) return {};
	const heightRaw = match[2];
	if (heightRaw == null) return { width };
	const height = Number(heightRaw);
	if (!Number.isFinite(height) || height <= 0) return { width };
	return { width, height };
}

function sizeTokenFromAlt(alt: string): string | undefined {
	const pipe = alt.lastIndexOf("|");
	if (pipe < 0) return undefined;
	return alt.slice(pipe + 1);
}

export function normalizeImageSrc(src: string): string {
	let value = src.trim();
	if (!value) return "";
	try {
		value = decodeURIComponent(value);
	} catch {
		/* keep the original text */
	}
	value = value.replace(/\\/g, "/");
	const hash = value.indexOf("#");
	if (hash >= 0) value = value.slice(0, hash);
	const query = value.indexOf("?");
	if (query >= 0) value = value.slice(0, query);
	if (value.startsWith("./")) value = value.slice(2);
	return value;
}

function imageTargets(root: ParentNode): HTMLElement[] {
	const targets: HTMLElement[] = [];
	root.querySelectorAll<HTMLElement>(".image-embed, img").forEach((el) => {
		if (el.classList.contains("__canvas__")) return;
		if (el.matches("img") && el.closest(".image-embed")) return;
		targets.push(el);
	});
	return targets;
}

function elementSrc(el: HTMLElement): string {
	const own = el.getAttribute("src");
	if (own) return own;
	return el.querySelector("img")?.getAttribute("src") ?? "";
}

/** Higher is better. A longer path wins so `folder/a.png` beats `a.png`. */
function matchScore(domSrc: string, requestSrc: string): number {
	if (domSrc === requestSrc) return 1_000_000 + requestSrc.length;
	if (domSrc.endsWith("/" + requestSrc)) return 100_000 + requestSrc.length;
	if (requestSrc.endsWith("/" + domSrc)) return requestSrc.length;
	return -1;
}

function takeRequest(queues: Map<string, ImageRequest[]>, domSrc: string): ImageRequest | undefined {
	const dom = normalizeImageSrc(domSrc);
	if (!dom) return undefined;
	let bestKey: string | undefined;
	let bestScore = -1;
	for (const [key, list] of queues) {
		if (list.length === 0) continue;
		const score = matchScore(dom, key);
		if (score > bestScore) {
			bestScore = score;
			bestKey = key;
		}
	}
	if (bestKey == null || bestScore < 0) return undefined;
	return queues.get(bestKey)?.shift();
}

function positiveAttr(el: HTMLElement, name: string): number | undefined {
	const raw = el.getAttribute(name);
	if (raw == null || raw.trim() === "") return undefined;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return undefined;
	return value;
}

function targetImage(el: HTMLElement): HTMLImageElement | null {
	if (el.instanceOf(HTMLImageElement)) return el;
	const img = el.querySelector("img");
	if (!(img instanceof HTMLImageElement) || img.classList.contains("__canvas__")) return null;
	return img;
}

async function fitOne(el: HTMLElement, maxWidth: number, maxHeight: number): Promise<void> {
	const img = targetImage(el);
	if (img && typeof img.decode === "function") {
		try {
			await img.decode();
		} catch {
			/* natural size may still be readable */
		}
	}

	const requestedWidth = positiveAttr(el, REQ_WIDTH);
	const requestedHeight = positiveAttr(el, REQ_HEIGHT);
	const naturalW = img?.naturalWidth ?? 0;
	const naturalH = img?.naturalHeight ?? 0;

	if (requestedWidth != null && requestedHeight != null) {
		applyFittedSize(el, img, fitImageBox({ width: requestedWidth, height: requestedHeight }, maxWidth, maxHeight), true);
		return;
	}
	if (requestedWidth != null && naturalW > 0 && naturalH > 0) {
		const height = requestedWidth * (naturalH / naturalW);
		applyFittedSize(el, img, fitImageBox({ width: requestedWidth, height }, maxWidth, maxHeight), false);
		return;
	}
	if (requestedWidth != null) {
		applyFittedSize(el, img, { width: Math.min(requestedWidth, maxWidth), height: 0 }, false);
		return;
	}
	if (naturalW > 0 && naturalH > 0) {
		applyFittedSize(el, img, fitImageBox({ width: naturalW, height: naturalH }, maxWidth, maxHeight), false);
	}
}

function applyFittedSize(el: HTMLElement, img: HTMLImageElement | null, fitted: ImageBox, explicitBox: boolean): void {
	const width = px(fitted.width);
	const height = explicitBox ? px(fitted.height) : null;
	el.style.width = width;
	el.addClass("pagina-fit-bound");
	el.style.height = height ?? "auto";
	el.toggleClass("pagina-fit-limit", Boolean(height));

	if (!img || img === el) return;
	img.addClass("pagina-fit-img");
	img.style.height = height ? "100%" : "auto";
	img.toggleClass("pagina-fit-fill", Boolean(height));
}

function px(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return `${rounded}px`;
}
