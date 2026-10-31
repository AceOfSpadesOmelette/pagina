import { PDFDocument, StandardFonts } from "pdf-lib";
import { effectiveVerticalMargins, LINE_MM, requiredMarginMm } from "../src/header-footer-layout";
import {
	allocateSlotSpans,
	slotColumnWidth,
	slotLeftEdges,
	slotLineCount,
	STAMP_SLOT_FONT_PT,
	wrapSlotText,
} from "../src/slot-wrap";

describe("header and footer slots", () => {
	it("gives the left, center, and right slots equal thirds", () => {
		const content = 180;
		const column = slotColumnWidth(content);
		const edges = slotLeftEdges(10, content);
		expect(column).toBeCloseTo(60);
		expect(edges[1]! - edges[0]!).toBeCloseTo(column);
		expect(edges[2]! - edges[1]!).toBeCloseTo(column);
		expect(10 + content - edges[2]!).toBeCloseTo(column);
	});

	it("keeps three occupied slots at equal thirds", () => {
		const spans = allocateSlotSpans(180, [200, 200, 200], [true, true, true]);
		expect(spans.map((span) => span.width)).toEqual([60, 60, 60]);
		expect(spans.map((span) => span.left)).toEqual([0, 60, 120]);
	});

	it("grows the right slot into an empty center and keeps it on the right edge", () => {
		const spans = allocateSlotSpans(180, [20, 0, 100], [true, false, true]);
		expect(spans[0]!.width).toBeCloseTo(60);
		expect(spans[0]!.left).toBeCloseTo(0);
		expect(spans[1]!.width).toBeCloseTo(20);
		expect(spans[2]!.width).toBeCloseTo(100);
		expect(spans[2]!.left).toBeCloseTo(80);
		expect(spans[2]!.left + spans[2]!.width).toBeCloseTo(180);
	});

	it("splits an empty center between both sides by how much each is short", () => {
		const spans = allocateSlotSpans(180, [100, 0, 110], [true, false, true]);
		expect(spans[0]!.width).toBeCloseTo(60 + (60 * 40) / 90);
		expect(spans[2]!.width).toBeCloseTo(60 + (60 * 50) / 90);
		expect(spans[1]!.width).toBeCloseTo(0);
		expect(spans[2]!.left).toBeCloseTo(spans[0]!.width);
		expect(spans[2]!.left + spans[2]!.width).toBeCloseTo(180);
	});

	it("does not let a filled center take space from a short left slot", () => {
		const spans = allocateSlotSpans(180, [10, 200, 0], [true, true, false]);
		expect(spans[0]!.width).toBeCloseTo(60);
		expect(spans[0]!.left).toBeCloseTo(0);
		expect(spans[1]!.width).toBeCloseTo(120);
		expect(spans[2]!.width).toBeCloseTo(0);
	});

	it("passes an empty left and center through to the right slot", () => {
		const spans = allocateSlotSpans(180, [0, 0, 100], [false, false, true]);
		expect(spans[2]!.width).toBeCloseTo(100);
		expect(spans[2]!.left).toBeCloseTo(80);
		expect(spans[0]!.width + spans[1]!.width + spans[2]!.width).toBeCloseTo(180);
	});

	it("counts lines from each slot's own width", async () => {
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const widthOf = (text: string) => font.widthOfTextAtSize(text, STAMP_SLOT_FONT_PT);
		const title = "6. Lec06 - Introduction to Asymmetric Cryptographic Algorithms";
		const full = widthOf(title);
		expect(slotLineCount(["Overview", "", title], widthOf, [full, full, full])).toBe(1);
		expect(slotLineCount(["Overview", "", title], widthOf, [full, full, full * 0.5])).toBeGreaterThan(1);
	});

	it("wraps a long section title onto full lines", async () => {
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const widthOf = (text: string) => font.widthOfTextAtSize(text, STAMP_SLOT_FONT_PT);
		const title = "6. Lec06 - Introduction to Asymmetric Cryptographic Algorithms";
		const column = widthOf(title) * 0.6;
		const lines = wrapSlotText(title, widthOf, column);

		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join(" ")).toBe(title);
		expect(lines.join("")).not.toContain("…");
		for (const line of lines) expect(widthOf(line)).toBeLessThanOrEqual(column + 0.01);
		expect(slotLineCount([title], widthOf, column)).toBe(lines.length);
		expect(slotLineCount(["Overview"], widthOf, column)).toBe(1);
	});

	it("splits a word that is wider than its third", async () => {
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const widthOf = (text: string) => font.widthOfTextAtSize(text, STAMP_SLOT_FONT_PT);
		const word = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const lines = wrapSlotText(word, widthOf, widthOf("ABCDEFGHIJ"));

		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join("")).toBe(word);
		expect(lines.join("")).not.toContain("…");
	});

	it("grows the margin by one line for each extra header line", () => {
		expect(requiredMarginMm("none", 2) - requiredMarginMm("none", 1)).toBeCloseTo(LINE_MM);
		const margins = effectiveVerticalMargins(
			{ top: 9, bottom: 9 },
			{ display: true, borderStyle: "none", lines: 2 },
			{ display: true, borderStyle: "none", lines: 1 },
		);
		expect(margins.top).toBeCloseTo(requiredMarginMm("none", 2));
		expect(margins.bottom).toBeCloseTo(requiredMarginMm("none", 1));
	});

	it("grows only the footer margin when the footer text is larger", () => {
		const base = effectiveVerticalMargins(
			{ top: 9, bottom: 9 },
			{ display: true, borderStyle: "none", lines: 1, fontSizePt: 6.75 },
			{ display: true, borderStyle: "none", lines: 1, fontSizePt: 6.75 },
		);
		const largerFooter = effectiveVerticalMargins(
			{ top: 9, bottom: 9 },
			{ display: true, borderStyle: "none", lines: 1, fontSizePt: 6.75 },
			{ display: true, borderStyle: "none", lines: 1, fontSizePt: 14 },
		);
		expect(largerFooter.top).toBeCloseTo(base.top);
		expect(largerFooter.bottom).toBeGreaterThan(base.bottom);
		expect(requiredMarginMm("none", 1)).toBeCloseTo(requiredMarginMm("none", 1, 6.75));
	});
});
