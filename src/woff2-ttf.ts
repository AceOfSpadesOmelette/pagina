/**
 * WOFF2 → TrueType. The decoder is woff2-encoder's wasm build, which is
 * instantiated with WebAssembly.instantiate and does not build script tags
 * or call eval / new Function.
 */

import decompress from "woff2-encoder/decompress";

export async function decodeWoff2(woff2: Uint8Array): Promise<Uint8Array> {
	const ttf = await decompress(woff2);
	if (ttf.length < 12) throw new Error("WOFF2 decoder returned an empty font");
	return ttf;
}
