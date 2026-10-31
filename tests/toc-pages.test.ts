import { clearConspectusEntryLinks, fillTocPageNumbers, layoutConspectusPageNumbers } from "../src/toc-layout";
import { addHeadingAnchors, wireConspectusTocLinks, wireHeadingBackToToc } from "../src/render";

describe("conspectus page-number rows", () => {
	function sample(): HTMLElement {
		const root = document.createElement("div");
		root.innerHTML = `
			<div class="conspectus-toc" data-conspectus-page-numbers="1" data-conspectus-leaders="true">
				<ul>
					<li class="conspectus-toc-item conspectus-toc-h1">
						<a class="internal-link" data-heading="Symantec Endpoint Protection" href="an://h1-3">3. Symantec Endpoint Protection</a>
						<ul>
							<li class="conspectus-toc-item conspectus-toc-h2">
								<a class="internal-link" data-heading="Details" href="an://h2-4">Details</a>
							</li>
						</ul>
					</li>
				</ul>
			</div>
		`;
		return root;
	}

	it("numbers entries through the chosen level and draws leaders", () => {
		const root = sample();
		layoutConspectusPageNumbers(root);
		const h1 = root.querySelector(".conspectus-toc-h1 > .conspectus-toc-entry");
		expect(h1?.classList.contains("conspectus-toc-leaders")).toBe(true);
		expect(h1?.querySelector(".conspectus-toc-leader")).not.toBeNull();
		expect(h1?.querySelector("a.md-print-anchor")?.getAttribute("href")).toBe("af://tocpage-h1-3");
		expect(root.querySelector(".conspectus-toc-h2 .conspectus-toc-entry")).toBeNull();
		expect(h1?.nextElementSibling?.tagName).toBe("UL");
	});

	it("keeps the page column and hides the dots", () => {
		const root = sample();
		root.querySelector(".conspectus-toc")?.setAttribute("data-conspectus-leaders", "false");
		layoutConspectusPageNumbers(root);
		const row = root.querySelector(".conspectus-toc-entry");
		expect(row?.classList.contains("conspectus-toc-leaders")).toBe(false);
		expect(row?.querySelector(".conspectus-toc-leader")).toBeNull();
		expect(row?.querySelector(".conspectus-toc-page")).not.toBeNull();
	});

	it("puts the leader and page number after the last word", () => {
		const root = document.createElement("div");
		const title =
			"1.5 Understand requirements for investigation types (i.e., administrative, criminal, civil, regulatory, industry standards).";
		root.innerHTML = `
			<div class="conspectus-toc" data-conspectus-page-numbers="1" data-conspectus-leaders="true">
				<ul>
					<li class="conspectus-toc-item conspectus-toc-h1">
						<a class="internal-link" data-heading="Investigation types" href="an://h1-5">${title}</a>
					</li>
				</ul>
			</div>
		`;
		layoutConspectusPageNumbers(root);
		const text = root.querySelector(".conspectus-toc-text");
		const link = text?.querySelector(":scope > a[data-heading]");
		expect(link?.textContent).toBe(title);
		expect(link?.getAttribute("href")).toBe("an://h1-5");
		expect(root.querySelectorAll(".conspectus-toc-entry a[data-heading]")).toHaveLength(1);
		expect(text?.nextElementSibling?.classList.contains("conspectus-toc-page")).toBe(true);
		expect(text?.querySelector(".conspectus-toc-leader")).not.toBeNull();
		expect(root.querySelector(".conspectus-toc-page a.internal-link")).toBeNull();
	});

	it("writes the heading page into the reserved column", () => {
		const root = sample();
		layoutConspectusPageNumbers(root);
		fillTocPageNumbers(root, { "h1-3": [4, 700] });
		const column = root.querySelector(".conspectus-toc-h1 .conspectus-toc-page");
		expect(column?.textContent).toBe("5");
		expect(column?.querySelector("a")).toBeNull();
		expect(root.querySelector(".conspectus-toc-leader")).not.toBeNull();
	});
});

describe("link switches", () => {
	function note(): HTMLElement {
		const root = document.createElement("div");
		root.innerHTML = `
			<div class="conspectus-toc" data-conspectus-page-numbers="2" data-conspectus-leaders="true">
				<ul>
					<li class="conspectus-toc-item conspectus-toc-h1">
						<a class="internal-link" data-heading="Overview" href="#Overview">Overview</a>
					</li>
				</ul>
			</div>
			<h1 data-heading="Overview">Overview</h1>
		`;
		return root;
	}

	it("removes contents links and leaves heading links", () => {
		const root = note();
		addHeadingAnchors(root);
		wireConspectusTocLinks(root);
		wireHeadingBackToToc(root);
		layoutConspectusPageNumbers(root);
		clearConspectusEntryLinks(root);

		expect(root.querySelector(".conspectus-toc a[data-heading]")?.getAttribute("href")).toBeNull();
		const flag = root.querySelector("h1 a.md-print-anchor")?.getAttribute("data-flag");
		expect(root.querySelector("h1 > a.pagina-heading-toc-link")?.getAttribute("href")).toBe(`an://tocback-${flag}`);
		expect(root.querySelector(`a[data-flag="tocback-${flag}"]`)).not.toBeNull();
		expect(root.querySelector("a[href^='af://tocpage-']")).not.toBeNull();
	});

	it("leaves contents links when heading links are not added", () => {
		const root = note();
		addHeadingAnchors(root);
		wireConspectusTocLinks(root);
		layoutConspectusPageNumbers(root);

		expect(root.querySelector("h1 > a.pagina-heading-toc-link")).toBeNull();
		const href = root.querySelector(".conspectus-toc a[data-heading]")?.getAttribute("href") ?? "";
		expect(href.startsWith("an://h")).toBe(true);
	});
});
