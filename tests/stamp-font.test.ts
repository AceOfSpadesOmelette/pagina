import { embedFullFace } from "../src/stamp-header-footer";

describe("header and footer font embedding", () => {
	it("embeds a CFF face whole", () => {
		expect(embedFullFace(Uint8Array.from([0x4f, 0x54, 0x54, 0x4f]))).toBe(true);
	});

	it("subsets a TrueType face", () => {
		expect(embedFullFace(Uint8Array.from([0x00, 0x01, 0x00, 0x00]))).toBe(false);
	});
});
