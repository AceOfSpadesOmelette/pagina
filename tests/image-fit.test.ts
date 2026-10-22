import { fitImageBox, fitStampedImages, parseImageRequests, stampImageRequests } from "../src/image-fit";

describe("parseImageRequests", () => {
	it("reads a wiki width and a wiki width and height", () => {
		const requests = parseImageRequests(
			"![[media/Pasted image 20261004211617.png|1000]]\n![[file.png|1000x400]]",
		);
		expect(requests).toEqual([
			{ src: "media/Pasted image 20261004211617.png", width: 1000 },
			{ src: "file.png", width: 1000, height: 400 },
		]);
	});

	it("reads a markdown image size and ignores a non-size alias", () => {
		const requests = parseImageRequests("![diagram|1000](figures/a.png)\n![[photo.png|caption]]");
		expect(requests).toEqual([
			{ src: "figures/a.png", width: 1000 },
			{ src: "photo.png" },
		]);
	});

	it("keeps separate sizes for the same file in order and skips fenced code", () => {
		const requests = parseImageRequests(
			["```", "![[a.png|9]]", "```", "![[a.png|100]]", "![[a.png|200x50]]"].join("\n"),
		);
		expect(requests.map((request) => request.width)).toEqual([100, 200]);
		expect(requests[1]?.height).toBe(50);
	});
});

describe("fitImageBox", () => {
	it("scales down to the content width and keeps the ratio", () => {
		expect(fitImageBox({ width: 1000, height: 800 }, 600, 900)).toEqual({ width: 600, height: 480 });
	});

	it("scales down to the content height and keeps the ratio", () => {
		expect(fitImageBox({ width: 400, height: 2000 }, 600, 900)).toEqual({ width: 180, height: 900 });
	});

	it("does not enlarge an image that already fits", () => {
		expect(fitImageBox({ width: 100, height: 50 }, 600, 900)).toEqual({ width: 100, height: 50 });
	});
});

describe("stamp and fit", () => {
	it("stamps embed sizes by src order", () => {
		document.body.innerHTML = [
			'<div class="image-embed" src="media/Pasted image 20261004211617.png"></div>',
			'<div class="image-embed" src="a.png"></div>',
			'<div class="image-embed" src="a.png"></div>',
		].join("");
		stampImageRequests(
			document.body,
			"![[media/Pasted image 20261004211617.png|1000]]\n![[a.png|100]]\n![[a.png|200x50]]",
		);
		const embeds = [...document.querySelectorAll(".image-embed")];
		expect(embeds[0]?.getAttribute("data-pagina-req-width")).toBe("1000");
		expect(embeds[0]?.hasAttribute("data-pagina-req-height")).toBe(false);
		expect(embeds[1]?.getAttribute("data-pagina-req-width")).toBe("100");
		expect(embeds[2]?.getAttribute("data-pagina-req-width")).toBe("200");
		expect(embeds[2]?.getAttribute("data-pagina-req-height")).toBe("50");
	});

	it("pairs a resolved vault path with the longest note path", () => {
		document.body.innerHTML = [
			'<div class="image-embed" src="app://local/vault/folder/a.png?1"></div>',
			'<div class="image-embed" src="app://local/vault/a.png?2"></div>',
		].join("");
		stampImageRequests(document.body, "![[a.png|100]]\n![[folder/a.png|200]]");
		const embeds = [...document.querySelectorAll(".image-embed")];
		expect(embeds[0]?.getAttribute("data-pagina-req-width")).toBe("200");
		expect(embeds[1]?.getAttribute("data-pagina-req-width")).toBe("100");
	});

	it("fits a width-only image using its natural ratio and caps the height", async () => {
		document.body.innerHTML = '<div class="image-embed" src="tall.png"><img alt=""></div>';
		stampImageRequests(document.body, "![[tall.png|400]]");
		const img = document.querySelector("img");
		if (!img) throw new Error("missing image");
		Object.defineProperty(img, "naturalWidth", { configurable: true, value: 400 });
		Object.defineProperty(img, "naturalHeight", { configurable: true, value: 2000 });
		img.decode = () => Promise.resolve();

		await fitStampedImages(document.body, 600, 900);

		const embed = document.querySelector(".image-embed");
		if (!(embed instanceof HTMLElement)) throw new Error("missing embed");
		expect(embed.style.width).toBe("180px");
		expect(embed.style.height).toBe("auto");
	});

	it("refits an explicit box from the stamped request", async () => {
		document.body.innerHTML = '<div class="image-embed" src="box.png"><img alt=""></div>';
		stampImageRequests(document.body, "![[box.png|1000x400]]");
		const img = document.querySelector("img");
		if (!img) throw new Error("missing image");
		img.decode = () => Promise.resolve();

		await fitStampedImages(document.body, 500, 400);
		await fitStampedImages(document.body, 200, 200);

		const embed = document.querySelector(".image-embed");
		if (!(embed instanceof HTMLElement)) throw new Error("missing embed");
		expect(embed.style.width).toBe("200px");
		expect(embed.style.height).toBe("80px");
	});
});
