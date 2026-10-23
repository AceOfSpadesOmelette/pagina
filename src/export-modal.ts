import { loadPdfJs, Modal, Notice, Platform, setIcon, Setting, type App, type TFile } from "obsidian";
import type PaginaPlugin from "./main";
import type { PaginaSettings } from "./types";
import { renderPaginaSettings } from "./settings-ui";
import { buildPdfBytes, exportNoteWithoutElectron } from "./pdf-export";
import { isPhoneSession } from "./session";
import {
	ExportCancelledError,
	isElectronPrintAvailable,
	openPath,
	promptSavePath,
	writePdfToPath,
} from "./electron-pdf";
import { mmToPx } from "./paginate";
import { effectiveLandscape, layoutWarning, resolvePageSizeMm } from "./page-presets";
import {
	applyH1StyleClasses,
	getDerivedLightVars,
	injectLightVarsPatch,
	removeLightVarsPatch,
	renderFlagsFromSettings,
	renderNoteForExport,
	type RenderedNote,
} from "./render";
import { prepareConspectusForPrint } from "./print-styles";

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
	private structureGen = 0;
	private resizeObserver: ResizeObserver | null = null;

	private settingsPane!: HTMLElement;
	private previewPane!: HTMLElement;
	private previewEl!: HTMLElement;
	private htmlWrap!: HTMLElement;
	private pdfWrap!: HTMLElement;
	private renderingEl!: HTMLElement;
	private layoutWarningEl!: HTMLElement;
	private htmlBtn: HTMLButtonElement | null = null;
	private pdfBtn: HTMLButtonElement | null = null;
	private exportBtnEl: HTMLButtonElement | null = null;
	private exportStatusEl: HTMLElement | null = null;

	constructor(app: App, plugin: PaginaPlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.draft = structuredClone(plugin.settings);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const mobile = isPhoneSession();
		this.containerEl.style.setProperty("--dialog-width", mobile ? "96vw" : "60vw");
		this.titleEl.setText("Export to PDF");
		injectLightVarsPatch(getDerivedLightVars());

		const root = contentEl.createDiv({ attr: { id: "pagina-export" } });
		root.toggleClass("pagina-export-mobile", mobile);
		root.toggleClass("pagina-no-preview", mobile);
		this.previewPane = root.createDiv({ cls: "print-preview" });
		this.settingsPane = root.createDiv({ cls: "setting-wrapper" });

		this.renderingEl = this.previewPane.createDiv({ cls: "rendering" });
		const loader = this.renderingEl.createSpan({ cls: "icon" });
		setIcon(loader, "loader");
		this.renderingEl.createSpan({ text: "Rendering" });
		this.renderingEl.hide();

		this.layoutWarningEl = this.previewPane.createDiv({ cls: "pagina-layout-warning" });
		this.layoutWarningEl.hide();

		this.exportStatusEl = this.previewPane.createDiv({ cls: "pagina-export-status" });
		this.exportStatusEl.hide();

		this.previewEl = this.previewPane.createDiv({ cls: "preview-stage" });
		this.htmlWrap = this.previewEl.createDiv({ cls: "print-preview-container" });
		this.pdfWrap = this.previewEl.createDiv({ cls: "pdf-pages" });
		if (mobile) {
			this.previewEl.hide();
			this.htmlWrap.hide();
			this.pdfWrap.hide();
		} else {
			const toggle = this.previewPane.createDiv({ cls: "toggle-container" });
			this.htmlBtn = this.makeModeButton(toggle, "globe", "HTML", "html");
			this.pdfBtn = this.makeModeButton(toggle, "notebook", "PDF", "pdf");
			this.pdfWrap.hide();
		}

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
		const scroll = pane.createDiv({ cls: "pagina-settings-scroll" });
		renderPaginaSettings(scroll, this.draft, {
			onRebuild: () => this.renderSettings(),
			onChange: () => this.onDraftChange(),
		});

		const actions = pane.createDiv({ cls: "pagina-export-actions" });
		new Setting(actions).addButton((btn) => {
			btn.setButtonText("Export").setCta().onClick(() => {
				void this.runExport();
			});
			btn.buttonEl.classList.add("pagina-export-btn");
			btn.setDisabled(this.exporting);
			this.exportBtnEl = btn.buttonEl;
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
		void this.applyDraftChange();
	}

	private needsFreshRender(): boolean {
		const root = this.rendered?.contentEl;
		if (!root) return false;
		const wasContinuous = root.dataset.paginaContinuous === "1";
		const wantContinuous = this.draft.cheatSheet && this.draft.cheatSheetDensity === "continuous";
		return wasContinuous !== wantContinuous;
	}

	private invalidateRender(): void {
		this.structureGen++;
		if (this.pdfTimer != null) {
			window.clearTimeout(this.pdfTimer);
			this.pdfTimer = null;
		}
		this.rendered?.cleanup();
		this.rendered = null;
		this.previewClone = null;
		this.pdfCache.clear();
		this.htmlWrap?.empty();
	}

	private async applyDraftChange(): Promise<void> {
		const message = this.refreshLayoutWarning();
		const refreshStructure = this.needsFreshRender();
		if (refreshStructure) this.invalidateRender();
		this.toggleTitle(this.draft.includeFileNameAsTitle);
		this.applyH1Styles();
		this.applyScale();
		if (message) {
			if (this.pdfTimer != null) {
				window.clearTimeout(this.pdfTimer);
				this.pdfTimer = null;
			}
			if (refreshStructure && !isPhoneSession()) {
				try {
					await this.renderDocument();
				} catch (err) {
					console.error(err);
				}
			}
			return;
		}
		if (isPhoneSession()) return;
		if (refreshStructure) {
			try {
				await this.renderDocument();
			} catch (err) {
				console.error(err);
				return;
			}
		}
		if (this.mode !== "pdf") return;
		if (!this.draft.enablePreview) {
			this.showPreviewDisabled();
			return;
		}
		this.schedulePdf();
	}

	private toggleTitle(show: boolean): void {
		const display = show ? "block" : "none";
		for (const root of [this.rendered?.printEl, this.previewClone]) {
			root?.querySelectorAll("h1.__title__").forEach((el) => {
				if (!el.instanceOf(HTMLElement)) return;
				el.style.display = display;
			});
		}
	}

	private applyH1Styles(): void {
		for (const root of [this.rendered?.printEl, this.previewClone]) {
			if (!root) continue;
			applyH1StyleClasses(root, this.draft);
			const content = root.querySelector<HTMLElement>(".markdown-preview-view") ?? root;
			prepareConspectusForPrint(content);
		}
	}

	private applyScale(): void {
		if (!this.previewEl || !this.htmlWrap) return;
		const page = resolvePageSizeMm(
			this.draft.pageSize,
			this.draft.customPageWidthMm,
			this.draft.customPageHeightMm,
			effectiveLandscape(this.draft),
		);
		const width = this.previewEl.offsetWidth;
		const scale = width > 0 ? Math.floor((mmToPx(page.width) / width) * 100) / 100 : 1;
		this.htmlWrap.style.setProperty("--modal-scale", String(scale > 0 ? scale : 1));
	}

	private showPreviewDisabled(): void {
		this.pdfGen++;
		if (this.pdfTimer != null) {
			window.clearTimeout(this.pdfTimer);
			this.pdfTimer = null;
		}
		this.pdfWrap.empty();
		this.pdfWrap.createDiv({
			cls: "pagina-preview-disabled",
			text: "Preview disabled. Click Export to generate PDF.",
		});
		this.pdfWrap.show();
		this.htmlWrap.hide();
		this.setRendering(false);
	}

	private async showInitial(): Promise<void> {
		if (isPhoneSession()) return;
		this.setRendering(true);
		try {
			await this.renderDocument();
		} catch (err) {
			console.error(err);
			const message = err instanceof Error ? err.message : String(err);
			const target = this.mode === "pdf" ? this.pdfWrap : this.htmlWrap;
			target.empty();
			target.createDiv({ cls: "pagina-preview-error", text: `Preview failed — ${message}` });
			target.show();
		} finally {
			this.setRendering(false);
		}
	}

	private async renderDocument(): Promise<void> {
		if (this.rendered) return;
		const gen = this.structureGen;
		if (this.renderPromise) {
			await this.renderPromise;
			if (this.rendered || gen !== this.structureGen) return;
		}
		const promise = (async () => {
			let rendered = await renderNoteForExport({
				app: this.app,
				file: this.file,
				...renderFlagsFromSettings(this.draft),
			});
			if (gen !== this.structureGen) {
				rendered.cleanup();
				return;
			}
			const wantContinuous = this.draft.cheatSheet && this.draft.cheatSheetDensity === "continuous";
			const wasContinuous = rendered.contentEl.dataset.paginaContinuous === "1";
			if (wantContinuous !== wasContinuous) {
				rendered.cleanup();
				if (gen !== this.structureGen) return;
				rendered = await renderNoteForExport({
					app: this.app,
					file: this.file,
					...renderFlagsFromSettings(this.draft),
				});
				if (gen !== this.structureGen) {
					rendered.cleanup();
					return;
				}
			}
			applyH1StyleClasses(rendered.printEl, this.draft);
			prepareConspectusForPrint(rendered.contentEl);
			this.rendered = rendered;
			this.mountHtmlPreview();
			this.applyScale();
		})();
		this.renderPromise = promise;
		try {
			await promise;
		} finally {
			if (this.renderPromise === promise) this.renderPromise = null;
		}
	}

	private mountHtmlPreview(): void {
		if (!this.rendered) return;
		this.htmlWrap.empty();
		const item = this.htmlWrap.createDiv({ cls: "print-preview-item" });
		const clone = this.rendered.printEl.cloneNode(true) as HTMLElement;
		clone.removeClass("pagina-parked-print");
		clone.addClass("pagina-preview-clone");
		item.appendChild(clone);
		this.previewClone = clone;
	}

	private async setMode(mode: PreviewMode): Promise<void> {
		if (isPhoneSession() || this.mode === mode) return;
		this.mode = mode;
		this.htmlBtn?.toggleClass("active", mode === "html");
		this.pdfBtn?.toggleClass("active", mode === "pdf");
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
		const reuseRender = this.rendered ?? undefined;
		const job = buildPdfBytes(this.app, this.file, settings, reuseRender)
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
		if (isPhoneSession()) return;
		if (!this.draft.enablePreview) {
			this.showPreviewDisabled();
			return;
		}
		if (this.refreshLayoutWarning()) return;
		const gen = ++this.pdfGen;
		this.setRendering(true);
		try {
			if (!isPhoneSession()) await this.renderDocument();
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
		const pdf = await openPdfDocument(bytes);
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const viewport = page.getViewport({ scale: Platform.isMobile ? 1 : 2.5 });
			const canvas = createEl("canvas");
			const context = canvas.getContext("2d");
			if (!context) continue;
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const wrapper = this.pdfWrap.createDiv({ cls: "pdf-canvas-page" });
			wrapper.appendChild(canvas);
			const rendered = page.render({ canvasContext: context, viewport });
			if (rendered.promise) await rendered.promise;
		}
	}

	private setRendering(on: boolean): void {
		if (on) this.renderingEl.show();
		else this.renderingEl.hide();
	}

	private setExportBusy(busy: boolean): void {
		this.exporting = busy;
		if (this.exportBtnEl) this.exportBtnEl.disabled = busy;
	}

	private setExportStatus(message: string | null): void {
		if (!this.exportStatusEl) return;
		if (!message) {
			this.exportStatusEl.setText("");
			this.exportStatusEl.hide();
			return;
		}
		this.exportStatusEl.setText(message);
		this.exportStatusEl.show();
	}

	/** Drop the parked HTML render so mobile raster does not keep two copies of the note. */
	private discardPreviewRender(): void {
		this.rendered?.cleanup();
		this.rendered = null;
		this.previewClone = null;
	}

	private async runExport(): Promise<void> {
		if (this.exporting) return;
		const layoutMessage = this.refreshLayoutWarning();
		if (layoutMessage) {
			new Notice(layoutMessage, 8000);
			return;
		}

		this.setExportBusy(true);
		const notice = new Notice("Pagina: exporting PDF…", 0);
		const setProgress = (message: string) => {
			try {
				notice.messageEl.setText(message);
			} catch {
				/* notice already dismissed */
			}
			this.setExportStatus(message);
		};

		try {
			this.plugin.settings = structuredClone(this.draft);
			await this.plugin.saveSettings();

			if (isElectronPrintAvailable()) {
				setProgress("Pagina: exporting PDF…");
				await this.renderDocument();
				const bytes = await this.ensurePdfBytes();
				const dest = await promptSavePath(this.file.basename, this.draft.timestampFormat);
				await writePdfToPath(dest, bytes);
				if (this.draft.openAfterExport) await openPath(dest);
				notice.hide();
				this.setExportStatus(null);
				new Notice(`Pagina: exported ${dest}`);
			} else {
				setProgress("Pagina: opening the print dialog…");
				this.discardPreviewRender();
				const outPath = await exportNoteWithoutElectron(this.app, this.file, this.plugin.settings, setProgress);
				notice.hide();
				this.setExportStatus(null);
				new Notice(
					outPath
						? `Pagina: exported ${outPath}`
						: "Pagina: in the print dialog, choose Save as PDF, then pick a folder.",
					8000,
				);
			}
			this.close();
		} catch (err) {
			try {
				notice.hide();
			} catch {
				/* ignore */
			}
			this.setExportStatus(null);
			console.error("Pagina export failed", err);
			if (err instanceof ExportCancelledError) {
				new Notice("Pagina: export cancelled");
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Pagina: export failed — ${message}`, 10000);
		} finally {
			this.setExportBusy(false);
		}
	}
}

interface PdfViewport {
	width: number;
	height: number;
}

interface PdfPageProxy {
	getViewport(params: { scale: number }): PdfViewport;
	render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise?: Promise<void> };
}

interface PdfDocumentProxy {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfPageProxy>;
}

interface PdfLoadTask {
	promise?: Promise<PdfDocumentProxy>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function openPdfDocument(bytes: Uint8Array): Promise<PdfDocumentProxy> {
	const loaded: unknown = await (loadPdfJs() as Promise<unknown>);
	if (!isRecord(loaded) || typeof loaded.getDocument !== "function") {
		throw new Error("PDF preview is unavailable");
	}
	const getDocument = loaded.getDocument as (params: { data: Uint8Array }) => PdfLoadTask | Promise<PdfDocumentProxy>;
	const task = getDocument({ data: bytes.slice() });
	if (isRecord(task) && task.promise instanceof Promise) return task.promise as Promise<PdfDocumentProxy>;
	return task as Promise<PdfDocumentProxy>;
}
