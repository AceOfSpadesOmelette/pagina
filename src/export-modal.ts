import { loadPdfJs, Modal, Notice, setIcon, Setting, type App, type TFile } from "obsidian";
import type PaginaPlugin from "./main";
import type { PaginaSettings } from "./types";
import { renderPaginaSettings } from "./settings-ui";
import { buildPdfBytes, exportNoteToPdf } from "./pdf-export";
import {
	ExportCancelledError,
	isElectronPrintAvailable,
	openPath,
	promptSavePath,
	writePdfToPath,
} from "./electron-pdf";
import { mmToPx } from "./paginate";
import { layoutWarning, resolvePageSizeMm } from "./page-presets";
import { getDerivedLightVars, injectLightVarsPatch, removeLightVarsPatch, renderNoteForExport, type RenderedNote } from "./render";

type PreviewMode = "html" | "pdf";

export class PaginaExportModal extends Modal {
	plugin: PaginaPlugin;
	file: TFile;
	draft: PaginaSettings;

	private exporting = false;
	private mode: PreviewMode = "html";
	private rendered: RenderedNote | null = null;
	private renderPromise: Promise<void> | null = null;
	private previewClone: HTMLElement | null = null;
	private pdfCache = new Map<string, Uint8Array>();
	private inflight = new Map<string, Promise<Uint8Array>>();
	private pdfTimer: number | null = null;
	private pdfGen = 0;
	private resizeObserver: ResizeObserver | null = null;

	private settingsPane!: HTMLElement;
	private previewPane!: HTMLElement;
	private previewEl!: HTMLElement;
	private htmlWrap!: HTMLElement;
	private pdfWrap!: HTMLElement;
	private renderingEl!: HTMLElement;
	private layoutWarningEl!: HTMLElement;
	private htmlBtn!: HTMLButtonElement;
	private pdfBtn!: HTMLButtonElement;

	constructor(app: App, plugin: PaginaPlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.draft = structuredClone(plugin.settings);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.containerEl.style.setProperty("--dialog-width", "60vw");
		this.titleEl.setText("Export to PDF");
		injectLightVarsPatch(getDerivedLightVars());

		const root = contentEl.createDiv({ attr: { id: "pagina-export" } });
		this.previewPane = root.createDiv({ cls: "print-preview" });
		this.settingsPane = root.createDiv({ cls: "setting-wrapper" });

		this.renderingEl = this.previewPane.createDiv({ cls: "rendering" });
		const loader = this.renderingEl.createSpan({ cls: "icon" });
		setIcon(loader, "loader");
		this.renderingEl.createSpan({ text: "Rendering" });
		this.renderingEl.hide();

		this.layoutWarningEl = this.previewPane.createDiv({ cls: "pagina-layout-warning" });
		this.layoutWarningEl.hide();

		const toggle = this.previewPane.createDiv({ cls: "toggle-container" });
		this.htmlBtn = this.makeModeButton(toggle, "globe", "HTML", "html");
		this.pdfBtn = this.makeModeButton(toggle, "notebook", "PDF", "pdf");

		this.previewEl = this.previewPane.createDiv({ cls: "preview-stage" });
		this.htmlWrap = this.previewEl.createDiv({ cls: "print-preview-container" });
		this.pdfWrap = this.previewEl.createDiv({ cls: "pdf-pages" });
		this.pdfWrap.hide();

		this.resizeObserver = new ResizeObserver(() => this.applyScale());
		this.resizeObserver.observe(this.previewEl);

		this.renderSettings();
		this.refreshLayoutWarning();
		contentEl.addEventListener("keyup", this.onKeyUp);

		void this.showInitial();
	}

	onClose(): void {
		if (this.pdfTimer != null) {
			window.clearTimeout(this.pdfTimer);
			this.pdfTimer = null;
		}
		this.pdfGen++;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.contentEl.removeEventListener("keyup", this.onKeyUp);
		this.rendered?.cleanup();
		this.rendered = null;
		this.previewClone = null;
		this.pdfCache.clear();
		this.inflight.clear();
		removeLightVarsPatch();
		document.querySelectorAll(".pagina-print").forEach((el) => el.remove());
		this.contentEl.empty();
	}

	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.key === "Enter") {
			void this.runExport();
		}
	};

	private makeModeButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		mode: PreviewMode,
	): HTMLButtonElement {
		const button = parent.createEl("button", { cls: mode === "html" ? "active" : "" });
		button.type = "button";
		const iconEl = button.createSpan({ cls: "icon" });
		setIcon(iconEl, icon);
		button.createSpan({ text: label });
		button.addEventListener("click", () => {
			void this.setMode(mode);
		});
		return button;
	}

	private renderSettings(): void {
		const pane = this.settingsPane;
		pane.empty();
		renderPaginaSettings(pane, this.draft, {
			onRebuild: () => this.renderSettings(),
			onChange: () => this.onDraftChange(),
		});

		const actions = pane.createDiv({ cls: "pagina-export-actions" });
		new Setting(actions).setHeading().addButton((btn) => {
			btn.setButtonText("Export").setCta().onClick(() => {
				void this.runExport();
			});
			btn.buttonEl.setAttribute("style", "margin: 0 auto; width: -webkit-fill-available;");
		});
	}

	private refreshLayoutWarning(): string | null {
		const message = layoutWarning(this.draft);
		if (!this.layoutWarningEl) return message;
		if (message) {
			this.layoutWarningEl.setText(message);
			this.layoutWarningEl.show();
		} else {
			this.layoutWarningEl.setText("");
			this.layoutWarningEl.hide();
		}
		return message;
	}

	private onDraftChange(): void {
		const message = this.refreshLayoutWarning();
		this.toggleTitle(this.draft.includeFileNameAsTitle);
		this.applyScale();
		if (message) {
			if (this.pdfTimer != null) {
				window.clearTimeout(this.pdfTimer);
				this.pdfTimer = null;
			}
			return;
		}
		if (this.mode === "pdf") this.schedulePdf();
	}

	private toggleTitle(show: boolean): void {
		const display = show ? "block" : "none";
		for (const root of [this.rendered?.printEl, this.previewClone]) {
			root?.querySelectorAll("h1.__title__").forEach((el) => {
				(el as HTMLElement).style.display = display;
			});
		}
	}

	private applyScale(): void {
		if (!this.previewEl || !this.htmlWrap) return;
		const page = resolvePageSizeMm(
			this.draft.pageSize,
			this.draft.customPageWidthMm,
			this.draft.customPageHeightMm,
			this.draft.landscape,
		);
		const width = this.previewEl.offsetWidth;
		const scale = width > 0 ? Math.floor((mmToPx(page.width) / width) * 100) / 100 : 1;
		this.htmlWrap.style.setProperty("--modal-scale", String(scale > 0 ? scale : 1));
	}

	private async showInitial(): Promise<void> {
		this.setRendering(true);
		try {
			await this.renderDocument();
		} catch (err) {
			console.error(err);
			const message = err instanceof Error ? err.message : String(err);
			this.htmlWrap.setText(`Preview failed — ${message}`);
		} finally {
			this.setRendering(false);
		}
	}

	private async renderDocument(): Promise<void> {
		if (this.rendered) return;
		if (this.renderPromise) {
			await this.renderPromise;
			return;
		}
		this.renderPromise = (async () => {
			this.rendered = await renderNoteForExport({
				app: this.app,
				file: this.file,
				includeTitle: this.draft.includeFileNameAsTitle,
			});
			this.mountHtmlPreview();
			this.applyScale();
		})();
		try {
			await this.renderPromise;
		} finally {
			this.renderPromise = null;
		}
	}

	private mountHtmlPreview(): void {
		if (!this.rendered) return;
		this.htmlWrap.empty();
		const item = this.htmlWrap.createDiv({ cls: "print-preview-item" });
		const clone = this.rendered.printEl.cloneNode(true) as HTMLElement;
		clone.style.display = "block";
		item.appendChild(clone);
		this.previewClone = clone;
	}

	private async setMode(mode: PreviewMode): Promise<void> {
		if (this.mode === mode) return;
		this.mode = mode;
		this.htmlBtn.toggleClass("active", mode === "html");
		this.pdfBtn.toggleClass("active", mode === "pdf");
		if (mode === "html") {
			this.pdfWrap.hide();
			this.htmlWrap.show();
			this.applyScale();
			return;
		}
		this.htmlWrap.hide();
		this.pdfWrap.show();
		if (this.refreshLayoutWarning()) {
			this.pdfWrap.empty();
			return;
		}
		await this.refreshPdf();
	}

	private schedulePdf(): void {
		if (this.pdfTimer != null) window.clearTimeout(this.pdfTimer);
		this.pdfTimer = window.setTimeout(() => {
			this.pdfTimer = null;
			void this.refreshPdf();
		}, 300);
	}

	private ensurePdfBytes(): Promise<Uint8Array> {
		const key = JSON.stringify(this.draft);
		const cached = this.pdfCache.get(key);
		if (cached) return Promise.resolve(cached);
		const pending = this.inflight.get(key);
		if (pending) return pending;
		const settings = structuredClone(this.draft);
		const job = buildPdfBytes(this.app, this.file, settings, this.rendered ?? undefined)
			.then(({ bytes }) => {
				this.pdfCache.set(key, bytes);
				return bytes;
			})
			.finally(() => {
				this.inflight.delete(key);
			});
		this.inflight.set(key, job);
		return job;
	}

	private async refreshPdf(): Promise<void> {
		if (this.refreshLayoutWarning()) return;
		const gen = ++this.pdfGen;
		this.setRendering(true);
		try {
			await this.renderDocument();
			if (gen !== this.pdfGen || this.mode !== "pdf") return;
			const bytes = await this.ensurePdfBytes();
			if (gen !== this.pdfGen || this.mode !== "pdf") return;
			await this.paintPdf(bytes);
		} catch (err) {
			console.error(err);
			if (gen !== this.pdfGen) return;
			const message = err instanceof Error ? err.message : String(err);
			this.pdfWrap.empty();
			this.pdfWrap.createDiv({ cls: "pagina-preview-error", text: `Preview failed — ${message}` });
		} finally {
			if (gen === this.pdfGen) this.setRendering(false);
		}
	}

	private async paintPdf(bytes: Uint8Array): Promise<void> {
		this.pdfWrap.empty();
		const pdfjsLib = await loadPdfJs();
		const data = bytes.slice();
		const task = pdfjsLib.getDocument({ data });
		const pdf = task.promise ? await task.promise : await task;

		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const viewport = page.getViewport({ scale: 2.5 });
			const canvas = document.createElement("canvas");
			const context = canvas.getContext("2d");
			if (!context) continue;
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const wrapper = this.pdfWrap.createDiv({ cls: "pdf-canvas-page" });
			wrapper.appendChild(canvas);
			const rendered = page.render({ canvasContext: context, viewport });
			if (rendered?.promise) await rendered.promise;
		}
	}

	private setRendering(on: boolean): void {
		if (on) this.renderingEl.show();
		else this.renderingEl.hide();
	}

	private async runExport(): Promise<void> {
		if (this.exporting) return;
		const layoutMessage = this.refreshLayoutWarning();
		if (layoutMessage) {
			new Notice(layoutMessage, 8000);
			return;
		}
		this.exporting = true;
		this.plugin.settings = structuredClone(this.draft);
		await this.plugin.saveSettings();

		const notice = new Notice("Pagina: exporting PDF…", 0);
		try {
			await this.renderDocument();
			if (isElectronPrintAvailable()) {
				const bytes = await this.ensurePdfBytes();
				const dest = await promptSavePath(this.file.basename, this.draft.timestampFormat);
				await writePdfToPath(dest, bytes);
				if (this.draft.openAfterExport) await openPath(dest);
				notice.hide();
				new Notice(`Pagina: exported ${dest}`);
			} else {
				const path = await exportNoteToPdf(this.app, this.file, this.plugin.settings);
				notice.hide();
				new Notice(`Pagina: exported ${path}`);
			}
			this.close();
		} catch (err) {
			notice.hide();
			if (err instanceof ExportCancelledError) {
				new Notice("Pagina: export cancelled");
				return;
			}
			console.error(err);
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Pagina: export failed — ${message}`, 8000);
		} finally {
			this.exporting = false;
		}
	}
}
