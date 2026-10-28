import { SECTION_TOP_SLACK_PT, sectionTitleForPage, templateUsesSection } from "../src/section-title";
import { renderTemplate } from "../src/variables";

const contentTop = 780;

describe("section title at the top of a page", () => {
	const headings = [
		{ level: 1, title: "5. SQL Server Management Studio", pageIndex: 6, y: 770 },
		{ level: 1, title: "6. Microsoft SQL Server 2022 Standard", pageIndex: 9, y: 770 },
		{ level: 2, title: "6.3. Edition and license", pageIndex: 12, y: 400 },
	];

	it("keeps an earlier heading in effect on the next page", () => {
		expect(sectionTitleForPage(headings, 7, 1, contentTop)).toBe("5. SQL Server Management Studio");
		expect(sectionTitleForPage(headings, 14, 2, contentTop)).toBe("6.3. Edition and license");
	});

	it("uses a heading that is the first line of the page", () => {
		expect(sectionTitleForPage(headings, 6, 1, contentTop)).toBe("5. SQL Server Management Studio");
		expect(headings[0]!.y).toBeGreaterThanOrEqual(contentTop - SECTION_TOP_SLACK_PT);
	});

	it("ignores a heading that starts lower on the page", () => {
		expect(sectionTitleForPage(headings, 12, 2, contentTop)).toBe("");
		expect(sectionTitleForPage(headings, 9, 1, contentTop)).toBe("6. Microsoft SQL Server 2022 Standard");
	});

	it("stays empty until the chosen level starts", () => {
		expect(sectionTitleForPage(headings, 8, 2, contentTop)).toBe("");
		expect(sectionTitleForPage(headings, 0, 1, contentTop)).toBe("");
	});

	it("shows the chosen level, not a deeper heading", () => {
		expect(sectionTitleForPage(headings, 14, 1, contentTop)).toBe("6. Microsoft SQL Server 2022 Standard");
	});

	it("uses the heading that still owns the page when the chosen level is missing", () => {
		const powerchute = [
			{ level: 2, title: "2.4. Disable unnecessary services", pageIndex: 3, y: 770 },
			{ level: 1, title: "4. Powerchute Serial Shutdown", pageIndex: 5, y: 770 },
		];
		expect(sectionTitleForPage(powerchute, 5, 6, contentTop)).toBe("4. Powerchute Serial Shutdown");
		expect(sectionTitleForPage(headings, 14, 6, contentTop)).toBe("6.3. Edition and license");
		expect(sectionTitleForPage(headings, 8, 6, contentTop)).toBe("5. SQL Server Management Studio");
	});
});

describe("{{section}}", () => {
	it("detects the token and substitutes the page title", () => {
		expect(templateUsesSection("{{ section }}")).toBe(true);
		expect(templateUsesSection("{{title}}")).toBe(false);
		expect(
			renderTemplate("{{section}}", {
				title: "Note",
				filename: "Note.md",
				page: 8,
				pages: 48,
				frontmatter: {},
				section: "5. SQL Server Management Studio",
			}),
		).toBe("5. SQL Server Management Studio");
		expect(
			renderTemplate("{{section}}", {
				title: "Note",
				filename: "Note.md",
				page: 1,
				pages: 2,
				frontmatter: {},
			}),
		).toBe("");
	});
});
