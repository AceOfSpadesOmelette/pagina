import { decodeWoff2 } from "./woff2-ttf";

interface FontFaceHit {
	family: string;
	weight: string;
	style: string;
	bytes: Uint8Array;
}

export interface VaultFontFiles {
	configDir: string;
	read: (normalizedPath: string) => Promise<string>;
}

export interface LoadedFace {
	bytes: Uint8Array | null;
	/** Set when a snippet face matched but could not be embedded. */
	error?: string;
}

const decoded = new Map<string, Promise<LoadedFace>>();

/** `textFontFamily` from the vault's appearance.json, when that file can be read. */
export async function vaultTextFontFamily(files: VaultFontFiles | undefined): Promise<string> {
	return (await readAppearance(files)).textFontFamily;
}

/**
 * TrueType bytes for a vault `@font-face` matching this CSS font stack.
 * Snippet files on disk are the source of truth; the live document is a fallback.
 * `bytes` is null when the name is a system font Chromium can already use.
 */
export function loadEmbeddableFont(familyStack: string, files?: VaultFontFiles): Promise<LoadedFace> {
	const key = `${files?.configDir ?? ""}|${familyStack.trim().toLowerCase()}`;
	if (!familyStack.trim()) return Promise.resolve({ bytes: null });
	let pending = decoded.get(key);
	if (!pending) {
		pending = embedMatchingFace(familyStack, files).catch((error) => {
			console.error("Pagina: could not embed the vault font", error);
			return { bytes: null, error: "Pagina could not embed the vault font for the header and footer." };
		});
		decoded.set(key, pending);
	}
	return pending;
}

async function embedMatchingFace(familyStack: string, files?: VaultFontFiles): Promise<LoadedFace> {
	const wanted = fontFamilyNames(familyStack);
	if (wanted.length === 0) return { bytes: null };
	const hits = await collectFontFaces(files);
	for (const name of wanted) {
		const matches = hits.filter((hit) => familyMatches(hit.family, name));
		matches.sort((a, b) => weightScore(a) - weightScore(b));
		const hit = matches[0];
		if (!hit) continue;
		try {
			const ttf = await toTrueType(hit.bytes);
			if (!ttf) {
				return { bytes: null, error: `Pagina could not convert ${hit.family} for the header and footer.` };
			}
			return { bytes: ttf };
		} catch (error) {
			console.error("Pagina: could not convert the vault font", error);
			return { bytes: null, error: `Pagina could not embed ${hit.family} in the header and footer.` };
		}
	}
	return { bytes: null };
}

function fontFamilyNames(stack: string): string[] {
	return stack
		.split(",")
		.map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
		.filter((name) => name && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(name));
}

function familyMatches(face: string, wanted: string): boolean {
	const left = face.trim().toLowerCase();
	const right = wanted.trim().toLowerCase();
	if (!left || !right) return false;
	return left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `);
}

function weightScore(hit: FontFaceHit): number {
	const weight = hit.weight.toLowerCase();
	const style = hit.style.toLowerCase();
	const normalWeight = weight === "" || weight === "400" || weight === "normal";
	const normalStyle = style === "" || style === "normal";
	if (normalWeight && normalStyle) return 0;
	if (normalStyle) return 1;
	return 2;
}

async function collectFontFaces(files?: VaultFontFiles): Promise<FontFaceHit[]> {
	const hits: FontFaceHit[] = [];
	const seen = new Set<string>();
	const addCss = (css: string) => {
		for (const hit of facesInCss(css)) {
			const id = `${hit.family}|${hit.weight}|${hit.style}|${hit.bytes.byteLength}`;
			if (seen.has(id)) continue;
			seen.add(id);
			hits.push(hit);
		}
	};
	for (const css of await snippetCss(files)) addCss(css);
	if (typeof document === "undefined") return hits;
	for (const node of Array.from(document.querySelectorAll("style"))) {
		addCss(node.textContent ?? "");
	}
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList | undefined;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		if (!rules) continue;
		for (const rule of Array.from(rules)) {
			if (rule instanceof CSSFontFaceRule) addCss(rule.cssText);
		}
	}
	return hits;
}

async function readAppearance(files: VaultFontFiles | undefined): Promise<{ textFontFamily: string; snippets: string[] }> {
	if (!files) return { textFontFamily: "", snippets: [] };
	try {
		const raw = await files.read(`${files.configDir}/appearance.json`);
		const parsed = JSON.parse(raw) as { textFontFamily?: unknown; enabledCssSnippets?: unknown };
		const snippets = Array.isArray(parsed.enabledCssSnippets)
			? parsed.enabledCssSnippets.map((name) => String(name))
			: [];
		return { textFontFamily: typeof parsed.textFontFamily === "string" ? parsed.textFontFamily.trim() : "", snippets };
	} catch {
		return { textFontFamily: "", snippets: [] };
	}
}

async function snippetCss(files: VaultFontFiles | undefined): Promise<string[]> {
	const appearance = await readAppearance(files);
	if (!files || appearance.snippets.length === 0) return [];
	const chunks: string[] = [];
	for (const name of appearance.snippets) {
		try {
			chunks.push(await files.read(`${files.configDir}/snippets/${name}.css`));
		} catch {
			/* snippet listed but missing */
		}
	}
	return chunks;
}

function facesInCss(css: string): FontFaceHit[] {
	const hits: FontFaceHit[] = [];
	const re = /@font-face\s*\{/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(css))) {
		const start = match.index + match[0].length;
		let depth = 1;
		let i = start;
		while (i < css.length && depth > 0) {
			const ch = css[i];
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
			i++;
		}
		const block = css.slice(start, i - 1);
		const family = prop(block, "font-family").replace(/['"]/g, "").trim();
		// `src` values contain semicolons inside the data URL (`octet-stream;base64`),
		// so the payload is taken from the whole rule, not the truncated property.
		const bytes = bytesFromSrc(block);
		if (!family || !bytes) continue;
		hits.push({
			family,
			weight: prop(block, "font-weight"),
			style: prop(block, "font-style"),
			bytes,
		});
	}
	return hits;
}

function prop(block: string, name: string): string {
	const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+)`, "i"));
	return match?.[1]?.trim() ?? "";
}

function bytesFromSrc(src: string): Uint8Array | null {
	const match = src.match(/data:[^;,]*;base64,([a-z0-9+/=\s]+)/i);
	const payload = match?.[1];
	if (!payload) return null;
	const binary = atob(payload.replace(/\s/g, ""));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out.byteLength > 0 ? out : null;
}

async function toTrueType(bytes: Uint8Array): Promise<Uint8Array | null> {
	if (isWoff2(bytes)) return decodeWoff2(bytes);
	if (isSfnt(bytes)) return bytes;
	return null;
}

function byteAt(bytes: Uint8Array, index: number): number {
	return bytes[index] ?? 0;
}

function isWoff2(bytes: Uint8Array): boolean {
	return bytes.length > 4 && byteAt(bytes, 0) === 0x77 && byteAt(bytes, 1) === 0x4f && byteAt(bytes, 2) === 0x46 && byteAt(bytes, 3) === 0x32;
}

function isSfnt(bytes: Uint8Array): boolean {
	if (bytes.length < 4) return false;
	const tag = String.fromCharCode(byteAt(bytes, 0), byteAt(bytes, 1), byteAt(bytes, 2), byteAt(bytes, 3));
	return tag === "OTTO" || tag === "true" || (byteAt(bytes, 0) === 0 && byteAt(bytes, 1) === 1 && byteAt(bytes, 2) === 0 && byteAt(bytes, 3) === 0);
}
