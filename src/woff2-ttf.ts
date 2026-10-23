/**
 * WOFF2 → TrueType via the bundled Google woff2 wasm build.
 * The decoder and wasm bytes are compiled into main.js.
 */

import wasmBinary from "../woff2.wasm";
import woff2Factory from "../woff2.cjs";

interface WoffVector {
	size: () => number;
	get: (index: number) => number;
}

interface WoffModule {
	woff2Dec: (buffer: Uint8Array, length: number) => WoffVector;
	onRuntimeInitialized?: () => void;
}

type ProcessListener = (...args: unknown[]) => void;

const factory = woff2Factory;
let ready: Promise<WoffModule> | null = null;

function snapshotUncaught(): ProcessListener[] {
	return process.listeners("uncaughtException") as unknown as ProcessListener[];
}

function snapshotUnhandled(): ProcessListener[] {
	return process.listeners("unhandledRejection") as unknown as ProcessListener[];
}

function restoreUncaught(previous: ProcessListener[]): void {
	process.removeAllListeners("uncaughtException");
	for (const listener of previous) {
		process.on("uncaughtException", listener);
	}
}

function restoreUnhandled(previous: ProcessListener[]): void {
	process.removeAllListeners("unhandledRejection");
	for (const listener of previous) {
		process.on("unhandledRejection", listener);
	}
}

function loadModule(): Promise<WoffModule> {
	if (!ready) {
		const pending = new Promise<WoffModule>((resolve, reject) => {
			try {
				const uncaught = snapshotUncaught();
				const unhandled = snapshotUnhandled();
				const mod = factory({ wasmBinary });
				restoreUncaught(uncaught);
				restoreUnhandled(unhandled);
				const timer = window.setTimeout(() => reject(new Error("WOFF2 decoder timed out")), 15000);
				mod.onRuntimeInitialized = () => {
					window.clearTimeout(timer);
					const woff2Dec = mod.woff2Dec.bind(mod);
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
