import { loadEmbeddableFont, resetEmbeddableFontCache, type SystemFontAccess, type VaultFontFiles } from "../src/vault-font";

function sfntCss(family: string, bytes: Uint8Array, style = "normal"): string {
	const b64 = Buffer.from(bytes).toString("base64");
	return `@font-face { font-family: "${family}"; font-weight: 400; font-style: ${style}; src: url(data:font/ttf;base64,${b64}); }`;
}

function appearance(snippets: readonly string[]): string {
	return JSON.stringify({ enabledCssSnippets: snippets, textFontFamily: "" });
}

function emptySystem(dir: string): SystemFontAccess {
	return {
		dirs: [dir],
		list: async () => [],
		read: async () => {
			throw new Error("no system font");
		},
	};
}

describe("vault font embedding", () => {
	beforeEach(() => {
		resetEmbeddableFontCache();
	});

	it("embeds a base64 @font-face whose family matches the footer font", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 7]);
		const files: VaultFontFiles = {
			configDir: "ncm/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(["new-computer-modern"]);
				if (file.endsWith("new-computer-modern.css")) return sfntCss("NewComputerModern10", bytes);
				throw new Error(file);
			},
		};
		const loaded = await loadEmbeddableFont("NewComputerModern10", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(bytes));
		expect(loaded.error).toBeUndefined();
	});

	it("matches Atkinson to an Atkinson Hyperlegible face", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 8]);
		const files: VaultFontFiles = {
			configDir: "atk/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(["atkinson-hyperlegible"]);
				if (file.endsWith("atkinson-hyperlegible.css")) return sfntCss("Atkinson Hyperlegible", bytes);
				throw new Error(file);
			},
		};
		const loaded = await loadEmbeddableFont("Atkinson", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(bytes));
	});

	it("reads a snippet font file when the face is not inlined", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 4]);
		const files: VaultFontFiles = {
			configDir: "url/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(["demo"]);
				if (file.endsWith("demo.css")) {
					return `@font-face { font-family: "DemoFile"; font-weight: 400; font-style: normal; src: url("demo.ttf"); }`;
				}
				throw new Error(file);
			},
			readBinary: async (file) => {
				if (file.endsWith("demo.ttf")) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
				throw new Error(file);
			},
		};
		const loaded = await loadEmbeddableFont("DemoFile", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(bytes));
	});

	it("embeds Arial from the system font directory when no @font-face exists", async () => {
		const ttf = new Uint8Array([0, 1, 0, 0, 2]);
		const files: VaultFontFiles = {
			configDir: "arial/.obsidian",
			read: async () => appearance([]),
			systemFonts: {
				dirs: ["arial-fonts"],
				list: async () => ["arial.ttf", "arialbd.ttf"],
				read: async (file) => {
					if (file.replace(/\\/g, "/").endsWith("/arial.ttf") || file.endsWith("arial.ttf")) return ttf;
					throw new Error(file);
				},
			},
		};
		const loaded = await loadEmbeddableFont("Arial", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(ttf));
	});

	it("finds a face in a snippet that is not enabled for the body", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 5]);
		const files: VaultFontFiles = {
			configDir: "disabled/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(["arial"]);
				if (file.endsWith("arial.css")) return "body { font-family: Arial; }";
				if (file.endsWith("atkinson-hyperlegible.css")) return sfntCss("Atkinson Hyperlegible", bytes);
				throw new Error(file);
			},
			list: async () => ({
				files: [
					"disabled/.obsidian/snippets/arial.css",
					"disabled/.obsidian/snippets/atkinson-hyperlegible.css",
				],
			}),
			systemFonts: emptySystem("disabled-fonts"),
		};
		const loaded = await loadEmbeddableFont("Atkinson Hyperlegible", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(bytes));
	});

	it("does not keep a miss after the snippet list changes", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 9]);
		let snippets: string[] = [];
		const files: VaultFontFiles = {
			configDir: "cache/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(snippets);
				if (file.endsWith("demo.css")) return sfntCss("Demo", bytes);
				throw new Error(file);
			},
			systemFonts: emptySystem("cache-fonts"),
		};
		const miss = await loadEmbeddableFont("Demo", files);
		expect(miss.bytes).toBeNull();
		expect(miss.error).toMatch(/Demo/);
		snippets = ["demo"];
		const hit = await loadEmbeddableFont("Demo", files);
		expect(Array.from(hit.bytes ?? [])).toEqual(Array.from(bytes));
		expect(hit.error).toBeUndefined();
	});

	it("keeps a later face when an earlier data url cannot be decoded", async () => {
		const bytes = new Uint8Array([0, 1, 0, 0, 6]);
		const css = [
			`@font-face { font-family: "Broken"; src: url(data:font/ttf;base64,abc); }`,
			sfntCss("NewComputerModern10", bytes),
		].join("\n");
		const files: VaultFontFiles = {
			configDir: "mixed/.obsidian",
			read: async (file) => {
				if (file.endsWith("appearance.json")) return appearance(["faces"]);
				if (file.endsWith("faces.css")) return css;
				throw new Error(file);
			},
			systemFonts: emptySystem("mixed-fonts"),
		};
		const loaded = await loadEmbeddableFont("NewComputerModern10", files);
		expect(Array.from(loaded.bytes ?? [])).toEqual(Array.from(bytes));
	});

	it("names the family when no snippet or system file matches", async () => {
		const files: VaultFontFiles = {
			configDir: "missing/.obsidian",
			read: async () => appearance([]),
			systemFonts: emptySystem("missing-fonts"),
		};
		const loaded = await loadEmbeddableFont("NoSuchFont", files);
		expect(loaded.bytes).toBeNull();
		expect(loaded.error).toBe("Pagina could not find NoSuchFont for the header and footer.");
	});
});
