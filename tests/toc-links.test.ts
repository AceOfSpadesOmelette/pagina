import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNumber,
	PDFString,
	type PDFRef,
} from "pdf-lib";
import { getDestPosition, setAnchors } from "../src/outline";
import { addHeadingAnchors, wireConspectusTocLinks, wireHeadingBackToToc } from "../src/render";

describe("conspectus PDF links", () => {
	it("points a printed TOC entry at the heading flag", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<div class="conspectus-toc">
				<h1 class="conspectus-toc-title">Table of Contents</h1>
				<ul>
					<li><a class="internal-link" data-heading="Skip installing network adapters" href="#Skip installing network adapters">Skip installing network adapters</a></li>
				</ul>
			</div>
			<h2 data-heading="Skip installing network adapters"><span class="ordinal-headings-label">2.1. </span>Skip installing network adapters</h2>
		`;
		addHeadingAnchors(root);
		wireConspectusTocLinks(root);

		const flag = root.querySelector("h2 a.md-print-anchor")?.getAttribute("data-flag");
		const tocLink = root.querySelector(".conspectus-toc a[data-heading]");
		expect(flag).toBeTruthy();
		expect(tocLink?.getAttribute("href")).toBe(`an://${flag}`);
	});

	it("links a heading back to its own contents row", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<div class="conspectus-toc">
				<ul>
					<li><a class="internal-link" data-heading="Mount the ISO" href="#Mount the ISO">Mount the ISO</a></li>
				</ul>
			</div>
			<h2 data-heading="Mount the ISO">Mount the ISO</h2>
			<h2 data-heading="Not listed">Not listed</h2>
		`;
		addHeadingAnchors(root);
		wireConspectusTocLinks(root);
		wireHeadingBackToToc(root);

		const flag = root.querySelector("h2 a.md-print-anchor")?.getAttribute("data-flag");
		const row = root.querySelector(".conspectus-toc li");
		expect(row?.querySelector("a.md-print-anchor")?.getAttribute("href")).toBe(`af://tocback-${flag}`);
		expect(root.querySelector("h2 a.pagina-heading-toc-link")?.getAttribute("href")).toBe(`an://tocback-${flag}`);
		const unlisted = root.querySelectorAll("h2")[1];
		expect(unlisted?.querySelector("a.pagina-heading-toc-link")?.getAttribute("href")).toBe("an://conspectus-toc");
	});

	it("links heading text back to the first printed table of contents", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<h1 class="__title__">File name</h1>
			<div class="conspectus-toc conspectus-toc-hide-export">
				<h1 class="conspectus-toc-title">Hidden</h1>
			</div>
			<div class="conspectus-toc">
				<h1 class="conspectus-toc-title">Table of Contents</h1>
			</div>
			<h2 data-heading="Mount the ISO">
				<span class="ordinal-headings-label">6.2. </span>
				Mount the ISO
				<a class="internal-link" href="#elsewhere">elsewhere</a>
			</h2>
		`;
		addHeadingAnchors(root);
		wireHeadingBackToToc(root);

		const printed = root.querySelector(".conspectus-toc:not(.conspectus-toc-hide-export)");
		const marker = printed?.querySelector("a.md-print-anchor[data-flag='conspectus-toc']");
		expect(marker?.getAttribute("href")).toBe("af://conspectus-toc");
		expect(marker?.parentElement).toBe(printed);
		expect(root.querySelector(".conspectus-toc-hide-export a[data-flag='conspectus-toc']")).toBeNull();

		expect(root.querySelector("h1.__title__ a.pagina-heading-toc-link")).toBeNull();
		const tocTitle = printed?.querySelector("h1.conspectus-toc-title");
		expect(tocTitle?.querySelector("a.pagina-heading-toc-link")).toBeNull();
		expect(tocTitle?.querySelector(":scope > a.md-print-anchor")).not.toBeNull();

		const heading = root.querySelector("h2");
		const back = heading?.querySelector(":scope > a.pagina-heading-toc-link");
		expect(back?.getAttribute("href")).toBe("an://conspectus-toc");
		expect(back?.textContent).toContain("6.2.");
		expect(back?.textContent).toContain("Mount the ISO");
		expect(back?.querySelector("a")).toBeNull();
		expect(heading?.querySelector(":scope > a.internal-link")?.textContent).toBe("elsewhere");
		const printAnchor = heading?.querySelector(":scope > a.md-print-anchor");
		expect(printAnchor).not.toBeNull();
		expect(back?.contains(printAnchor ?? null)).toBe(false);
	});

	it("leaves headings plain when every table of contents is hidden", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<div class="conspectus-toc conspectus-toc-hide-export"></div>
			<h2>Skip installing network adapters</h2>
		`;
		wireHeadingBackToToc(root);
		expect(root.querySelector("a.pagina-heading-toc-link")).toBeNull();
		expect(root.querySelector("a[data-flag='conspectus-toc']")).toBeNull();
		expect(root.querySelector("h2")?.textContent).toBe("Skip installing network adapters");
	});

	it("writes XYZ destinations from af:// marker positions", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage([595.92, 841.92]);
		const refs = [
			linkAnnot(doc, "af://h2-4", [568.5, 745.17, 569.25, 745.92]),
			linkAnnot(doc, "an://h2-4", [111.75, 442.17, 470.25, 457.17]),
			linkAnnot(doc, "af://conspectus-toc", [568.5, 700, 569.25, 700.75]),
			linkAnnot(doc, "an://conspectus-toc", [53, 98, 305, 115]),
		];
		page.node.set(PDFName.of("Annots"), doc.context.obj(refs));

		const positions = await getDestPosition(doc);
		expect(positions["h2-4"]?.[1]).toBeCloseTo(745.17, 1);
		expect(positions["conspectus-toc"]?.[1]).toBeCloseTo(700, 1);
		setAnchors(doc, positions);

		const annots = page.node.Annots();
		expect(annots).toBeTruthy();
		expectXyz(annots!.lookup(1, PDFDict), positions["h2-4"]![1]);
		expectXyz(annots!.lookup(3, PDFDict), positions["conspectus-toc"]![1]);
	});
});

function linkAnnot(doc: PDFDocument, uri: string, rect: number[]): PDFRef {
	const annot = doc.context.obj({
		Type: "Annot",
		Subtype: "Link",
		Rect: rect,
		Border: [0, 0, 0],
		A: {
			Type: "Action",
			S: "URI",
			URI: PDFString.of(uri),
		},
	});
	return doc.context.register(annot);
}

function expectXyz(annot: PDFDict, y: number): void {
	const dest = annot.lookup(PDFName.of("Dest"));
	expect(dest).toBeInstanceOf(PDFArray);
	const arr = dest as PDFArray;
	expect(arr.lookup(1)?.toString()).toBe("/XYZ");
	expect(arr.lookup(2)?.toString()).toBe("null");
	expect((arr.lookup(3) as PDFNumber).asNumber()).toBeCloseTo(y, 1);
	expect(arr.lookup(4)?.toString()).toBe("null");
}
