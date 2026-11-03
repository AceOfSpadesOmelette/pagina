import { promises as nodeFs } from "fs";
import os from "os";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { decodeWoff2 } from "./woff2-ttf";

interface FontFaceHit {
	family: string;
	weight: string;
	style: string;
	bytes: Uint8Array;
}

export interface VaultFontList {
	files: string[];
	folders?: string[];
}

/** OS font directories. Tests supply this so resolution does not touch the real disk. */
export interface SystemFontAccess {
	dirs: string[];
	/** Absolute paths, or bare file names inside `dir`. */
	list: (dir: string) => Promise<string[]>;
	read: (filePath: string) => Promise<Uint8Array>;
}

export interface VaultFontFiles {
	configDir: string;
	read: (normalizedPath: string) => Promise<string>;
	readBinary?: (normalizedPath: string) => Promise<ArrayBuffer>;
	list?: (normalizedPath: string) => Promise<VaultFontList>;
	systemFonts?: SystemFontAccess;
}

export interface LoadedFace {
	bytes: Uint8Array | null;
	/** Set when a requested face matched but could not be embedded, or no file was found. */
	error?: string;
}

const decoded = new Map<string, Promise<LoadedFace>>();
const fontListings = new Map<string, Promise<string[]>>();
const fontNameIndexes = new Map<string, Promise<Map<string, string>>>();

const FONT_FILE = /\.(ttf|otf|woff2)$/i;

/** Windows face name → file names shipped with the OS, regular face first. */
const KNOWN_SYSTEM_FILES: Record<string, readonly string[]> = {
	arial: ["arial.ttf", "Arial.ttf"],
	"arial bold": ["arialbd.ttf", "Arial Bold.ttf"],
	"arial italic": ["ariali.ttf", "Arial Italic.ttf"],
	"arial bold italic": ["arialbi.ttf", "Arial Bold Italic.ttf"],
	"times new roman": ["times.ttf", "Times New Roman.ttf"],
	"times new roman bold": ["timesbd.ttf"],
	"times new roman italic": ["timesi.ttf"],
	"times new roman bold italic": ["timesbi.ttf"],
	"courier new": ["cour.ttf", "Courier New.ttf"],
	calibri: ["calibri.ttf"],
	"calibri bold": ["calibrib.ttf"],
	cambria: ["cambria.ttf"],
	"segoe ui": ["segoeui.ttf"],
	georgia: ["georgia.ttf"],
	"georgia bold": ["georgiab.ttf"],
	verdana: ["verdana.ttf"],
	tahoma: ["tahoma.ttf"],
	"trebuchet ms": ["trebuc.ttf"],
	consolas: ["consola.ttf"],
	candara: ["candara.ttf"],
	constantia: ["constan.ttf"],
	corbel: ["corbel.ttf"],
	impact: ["impact.ttf"],
	"comic sans ms": ["comic.ttf"],
	"lucida console": ["lucon.ttf"],
	"palatino linotype": ["pala.ttf"],
	garamond: ["gara.ttf"],
	"century gothic": ["gothic.ttf"],
	"book antiqua": ["bkant.ttf"],
	helvetica: ["Helvetica.ttf", "helvetica.ttf"],
	"helvetica neue": ["HelveticaNeue.ttf"],
};

/** Drop cached faces so a later export sees newly enabled snippets. */
export function resetEmbeddableFontCache(): void {
	decoded.clear();
	fontListings.clear();
	fontNameIndexes.clear();
}

/** `textFontFamily` from the vault's appearance.json, when that file can be read. */
export async function vaultTextFontFamily(files: VaultFontFiles | undefined): Promise<string> {
	return (await readAppearance(files)).textFontFamily;
}

/**
 * SFNT bytes for a header or footer face.
 * Enabled snippet `@font-face` rules are checked first, then every snippet in
 * the vault, then an installed system font of the same name. System fonts are
 * stamped too: Chromium's header and footer document does not reliably use them.
 */
export async function loadEmbeddableFont(familyStack: string, files?: VaultFontFiles): Promise<LoadedFace> {
	if (!familyStack.trim()) return { bytes: null };
	const key = await cacheKey(familyStack, files);
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

async function cacheKey(familyStack: string, files?: VaultFontFiles): Promise<string> {
	const appearance = await readAppearance(files);
	const listed = await snippetFileNames(files);
	const systemKey = files?.systemFonts ? files.systemFonts.dirs.join("\0") : "os";
	return [
		files?.configDir ?? "",
		appearance.snippets.join("\n"),
		listed.join("\n"),
		systemKey,
		familyStack.trim().toLowerCase(),
	].join("|");
}

async function embedMatchingFace(familyStack: string, files?: VaultFontFiles): Promise<LoadedFace> {
	const wanted = fontFamilyNames(familyStack);
	if (wanted.length === 0) return { bytes: null };
	const enabled = await collectFontFaces(files, "enabled");
	const fromEnabled = await firstConvertible(wanted, enabled);
	if (fromEnabled) return fromEnabled;
	const extras = await collectFontFaces(files, "disabled");
	const fromExtras = await firstConvertible(wanted, extras);
	if (fromExtras) return fromExtras;
	for (const name of wanted) {
		const system = await loadSystemFace(name, files);
		if (system) return { bytes: system };
	}
	const label = wanted[0] ?? familyStack.trim();
	return { bytes: null, error: `Pagina could not find ${label} for the header and footer.` };
}

async function firstConvertible(wanted: readonly string[], hits: readonly FontFaceHit[]): Promise<LoadedFace | null> {
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
	return null;
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

async function collectFontFaces(files: VaultFontFiles | undefined, which: "enabled" | "disabled"): Promise<FontFaceHit[]> {
	const hits: FontFaceHit[] = [];
	const seen = new Set<string>();
	const add = (hit: FontFaceHit) => {
		const id = `${hit.family}|${hit.weight}|${hit.style}|${hit.bytes.byteLength}`;
		if (seen.has(id)) return;
		seen.add(id);
		hits.push(hit);
	};
	const appearance = await readAppearance(files);
	const cssFiles = which === "enabled" ? await enabledSnippetCss(files, appearance.snippets) : await disabledSnippetCss(files, appearance.snippets);
	for (const css of cssFiles) {
		for (const hit of await hitsInCss(css, files)) add(hit);
	}
	if (which === "disabled" || typeof document === "undefined") return hits;
	for (const node of Array.from(document.querySelectorAll("style"))) {
		for (const hit of await hitsInCss(node.textContent ?? "", files)) add(hit);
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
			if (rule instanceof CSSFontFaceRule) {
				for (const hit of await hitsInCss(rule.cssText, files)) add(hit);
			}
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

async function snippetFileNames(files: VaultFontFiles | undefined): Promise<string[]> {
	if (!files?.list) return [];
	try {
		const listed = await files.list(snippetDir(files));
		return listed.files.filter((file) => file.toLowerCase().endsWith(".css")).sort();
	} catch {
		return [];
	}
}

function snippetDir(files: VaultFontFiles): string {
	return `${files.configDir}/snippets`;
}

function snippetBase(file: string): string {
	const name = file.split(/[/\\]/).pop() ?? file;
	return name.replace(/\.css$/i, "");
}

async function enabledSnippetCss(files: VaultFontFiles | undefined, names: readonly string[]): Promise<string[]> {
	if (!files || names.length === 0) return [];
	const chunks: string[] = [];
	for (const name of names) {
		try {
			chunks.push(await files.read(`${snippetDir(files)}/${name}.css`));
		} catch {
			/* snippet listed but missing */
		}
	}
	return chunks;
}

async function disabledSnippetCss(files: VaultFontFiles | undefined, enabled: readonly string[]): Promise<string[]> {
	if (!files?.list) return [];
	let filesOnDisk: string[] = [];
	try {
		filesOnDisk = (await files.list(snippetDir(files))).files;
	} catch {
		return [];
	}
	const enabledSet = new Set(enabled);
	const chunks: string[] = [];
	for (const file of filesOnDisk) {
		if (!file.toLowerCase().endsWith(".css")) continue;
		if (enabledSet.has(snippetBase(file))) continue;
		try {
			chunks.push(await files.read(file));
		} catch {
			/* unreadable snippet */
		}
	}
	return chunks;
}

async function hitsInCss(css: string, files?: VaultFontFiles): Promise<FontFaceHit[]> {
	const hits: FontFaceHit[] = [];
	for (const block of fontFaceBlocks(css)) {
		try {
			const family = prop(block, "font-family").replace(/['"]/g, "").trim();
			if (!family) continue;
			const bytes = bytesFromSrc(block) ?? (files ? await bytesFromUrl(files, fileUrl(block)) : null);
			if (!bytes) continue;
			hits.push({
				family,
				weight: prop(block, "font-weight"),
				style: prop(block, "font-style"),
				bytes,
			});
		} catch (error) {
			console.error("Pagina: skipped a font face", error);
		}
	}
	return hits;
}

function fontFaceBlocks(css: string): string[] {
	const blocks: string[] = [];
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
		blocks.push(css.slice(start, i - 1));
	}
	return blocks;
}

function prop(block: string, name: string): string {
	const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+)`, "i"));
	return match?.[1]?.trim() ?? "";
}

function bytesFromSrc(src: string): Uint8Array | null {
	const match = src.match(/data:[^;,]*;base64,([a-z0-9+/=\s]+)/i);
	const payload = match?.[1];
	if (!payload) return null;
	try {
		const binary = atob(payload.replace(/\s/g, ""));
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out.byteLength > 0 ? out : null;
	} catch {
		return null;
	}
}

function fileUrl(block: string): string {
	const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(block))) {
		const url = match[2]?.trim() ?? "";
		if (url && !/^data:/i.test(url)) return url;
	}
	return "";
}

async function bytesFromUrl(files: VaultFontFiles, url: string): Promise<Uint8Array | null> {
	if (!url || !files.readBinary) return null;
	let cleaned = url.split("?")[0]?.split("#")[0]?.trim() ?? "";
	if (!cleaned || /^(data|https?|app|blob):/i.test(cleaned)) return null;
	try {
		cleaned = decodeURIComponent(cleaned);
	} catch {
		/* keep the raw url */
	}
	const rel = cleaned.replace(/^\.\//, "").replace(/^[/\\]+/, "");
	const base = rel.split(/[/\\]/).pop() || rel;
	const candidates = [
		`${snippetDir(files)}/${rel}`,
		`${files.configDir}/fonts/${base}`,
		`${files.configDir}/${rel}`,
		rel,
	];
	const seen = new Set<string>();
	for (const candidate of candidates) {
		const key = candidate.replace(/\\/g, "/");
		if (seen.has(key)) continue;
		seen.add(key);
		try {
			const data = await files.readBinary(candidate);
			if (data.byteLength > 0) return new Uint8Array(data);
		} catch {
			/* try the next location */
		}
	}
	return null;
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

function defaultSystemFontAccess(): SystemFontAccess {
	return {
		dirs: systemFontDirectories(),
		list: async (dir) => {
			const out: string[] = [];
			await walkFonts(dir, 0, out);
			return out;
		},
		read: async (filePath) => new Uint8Array(await nodeFs.readFile(filePath)),
	};
}

function systemFontDirectories(): string[] {
	const home = os.homedir();
	if (process.platform === "win32") {
		const windir = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
		return [
			path.join(windir, "Fonts"),
			path.join(home, "AppData", "Local", "Microsoft", "Windows", "Fonts"),
		];
	}
	if (process.platform === "darwin") {
		return [
			"/System/Library/Fonts",
			"/System/Library/Fonts/Supplemental",
			"/Library/Fonts",
			path.join(home, "Library", "Fonts"),
		];
	}
	return [
		"/usr/share/fonts",
		"/usr/local/share/fonts",
		path.join(home, ".local", "share", "fonts"),
		path.join(home, ".fonts"),
	];
}

async function walkFonts(dir: string, depth: number, out: string[]): Promise<void> {
	if (depth > 4) return;
	let entries: Awaited<ReturnType<typeof nodeFs.readdir>> = [];
	try {
		entries = await nodeFs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkFonts(full, depth + 1, out);
			continue;
		}
		if (FONT_FILE.test(entry.name)) out.push(full);
	}
}

async function loadSystemFace(family: string, files?: VaultFontFiles): Promise<Uint8Array | null> {
	const access = files?.systemFonts ?? defaultSystemFontAccess();
	const listed = await listedFontFiles(access);
	const known = KNOWN_SYSTEM_FILES[family.trim().toLowerCase()];
	const byName = known ? findByBase(listed, known) : null;
	const chosen = byName ?? findByStem(listed, family) ?? (await findByFontMetadata(access, listed, family));
	if (!chosen) return null;
	try {
		const bytes = await access.read(chosen);
		return await toTrueType(bytes);
	} catch (error) {
		console.error("Pagina: could not read the system font", error);
		return null;
	}
}

async function listedFontFiles(access: SystemFontAccess): Promise<string[]> {
	const key = access.dirs.join("\0");
	let pending = fontListings.get(key);
	if (!pending) {
		pending = (async () => {
			const found: string[] = [];
			for (const dir of access.dirs) {
				let entries: string[] = [];
				try {
					entries = await access.list(dir);
				} catch {
					continue;
				}
				for (const entry of entries) found.push(resolveListed(dir, entry));
			}
			return found;
		})();
		fontListings.set(key, pending);
	}
	return pending;
}

function resolveListed(dir: string, entry: string): string {
	if (path.isAbsolute(entry)) return entry;
	if (entry.includes("/") || entry.includes("\\")) return entry;
	return path.join(dir, entry);
}

function findByBase(files: readonly string[], names: readonly string[]): string | null {
	const wanted = new Set(names.map((name) => name.toLowerCase()));
	for (const file of files) {
		if (wanted.has(path.basename(file).toLowerCase())) return file;
	}
	return null;
}

function findByStem(files: readonly string[], family: string): string | null {
	const stem = compact(family);
	if (stem.length < 2) return null;
	const matches = files.filter((file) => compact(path.basename(file, path.extname(file))) === stem);
	matches.sort((a, b) => extRank(a) - extRank(b));
	return matches[0] ?? null;
}

function extRank(file: string): number {
	const ext = path.extname(file).toLowerCase();
	if (ext === ".ttf") return 0;
	if (ext === ".otf") return 1;
	return 2;
}

function compact(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function findByFontMetadata(access: SystemFontAccess, files: readonly string[], family: string): Promise<string | null> {
	const index = await fontNameIndex(access, files);
	const exact = index.get(family.trim().toLowerCase());
	if (exact) return exact;
	let prefix: string | null = null;
	for (const [name, file] of index) {
		if (!familyMatches(name, family)) continue;
		if (name === family.trim().toLowerCase()) return file;
		prefix ??= file;
	}
	return prefix;
}

async function fontNameIndex(access: SystemFontAccess, files: readonly string[]): Promise<Map<string, string>> {
	const key = access.dirs.join("\0");
	let pending = fontNameIndexes.get(key);
	if (!pending) {
		pending = (async () => {
			const index = new Map<string, string>();
			const capped = files.slice(0, 400);
			for (const file of capped) {
				let bytes: Uint8Array;
				try {
					bytes = await access.read(file);
				} catch {
					continue;
				}
				let face;
				try {
					face = fontkit.create(bytes);
				} catch {
					continue;
				}
				for (const raw of [face.familyName, face.fullName, face.postscriptName]) {
					const name = raw?.trim().toLowerCase();
					if (!name || index.has(name)) continue;
					index.set(name, file);
				}
			}
			return index;
		})();
		fontNameIndexes.set(key, pending);
	}
	return pending;
}
