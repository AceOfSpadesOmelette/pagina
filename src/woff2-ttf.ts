import { createRequire } from "module";

/**
 * WOFF2 → TrueType via the bundled Google woff2 wasm build
 * (fonteditor-core / woff2-wasm). Chromium's header document cannot load a
 * vault `@font-face`, so the export embeds this TrueType instead.
 * `woff2.cjs` and `woff2.wasm` sit next to main.js.
 */

const nodeRequire = createRequire(typeof __filename === "string" && __filename ? __filename : process.execPath);

interface WoffVector {
	size: () => number;
	get: (index: number) => number;
}

interface WoffModule {
	woff2Dec: (buffer: Uint8Array, length: number) => WoffVector;
	onRuntimeInitialized?: () => void;
}

let assetDir = "";
let ready: Promise<WoffModule> | null = null;

export function setWoff2AssetDir(dir: string): void {
	if (dir && dir !== assetDir) {
		assetDir = dir;
		ready = null;
	}
}

function decoderDir(): string {
	if (assetDir) return assetDir;
	if (typeof __dirname === "string" && __dirname) return __dirname;
	throw new Error("Pagina font decoder is not installed");
}

function restoreProcessListeners(event: "uncaughtException" | "unhandledRejection", previous: Function[]): void {
	process.removeAllListeners(event);
	for (const listener of previous) process.on(event, listener as (...args: unknown[]) => void);
}

function loadModule(): Promise<WoffModule> {
	if (!ready) {
		const pending = new Promise<WoffModule>((resolve, reject) => {
			try {
				const fs = nodeRequire("fs") as typeof import("fs");
				const path = nodeRequire("path") as typeof import("path");
				const dir = decoderDir();
				const factory = nodeRequire(path.join(dir, "woff2.cjs")) as (opts: Record<string, unknown>) => WoffModule;
				const wasm = fs.readFileSync(path.join(dir, "woff2.wasm"));
				const uncaught = process.listeners("uncaughtException");
				const unhandled = process.listeners("unhandledRejection");
				const mod = factory({ wasmBinary: wasm });
				// The decoder traps process errors and rethrows them forever. Put the previous handlers back.
				restoreProcessListeners("uncaughtException", uncaught);
				restoreProcessListeners("unhandledRejection", unhandled);
				const timer = setTimeout(() => reject(new Error("WOFF2 decoder timed out")), 15000);
				mod.onRuntimeInitialized = () => {
					clearTimeout(timer);
					const woff2Dec = mod.woff2Dec.bind(mod);
					// The module object is thenable. Resolve with a plain wrapper instead.
					resolve({ woff2Dec });
				};
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
		ready = pending;
		pending.catch(() => {
			if (ready === pending) ready = null;
		});
	}
	return ready;
}

export async function decodeWoff2(woff2: Uint8Array): Promise<Uint8Array> {
	const mod = await loadModule();
	const vec = mod.woff2Dec(woff2, woff2.byteLength);
	const out = new Uint8Array(vec.size());
	for (let i = 0; i < out.length; i++) out[i] = vec.get(i) & 0xff;
	if (out.length < 12) throw new Error("WOFF2 decoder returned an empty font");
	return out;
}
