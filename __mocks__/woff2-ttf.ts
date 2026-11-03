/** Unit tests use SFNT fixtures. The real decoder pulls in an ESM wasm build Jest cannot parse. */
export async function decodeWoff2(): Promise<Uint8Array> {
	throw new Error("woff2 decode is not available in unit tests");
}
