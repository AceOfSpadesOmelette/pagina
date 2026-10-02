import { MarkdownView, Menu, Notice, Plugin, TFile } from "obsidian";
import { PaginaExportModal } from "./export-modal";
import { PaginaSettingTab } from "./settings";
import { DEFAULT_SETTINGS, normalizeSettings, type PaginaSettings } from "./types";
import { usePluginFontDir } from "./vault-font";

export default class PaginaPlugin extends Plugin {
	settings: PaginaSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		usePluginFontDir((this.manifest as { dir?: string }).dir);
		await this.loadSettings();

		this.addSettingTab(new PaginaSettingTab(this.app, this));

		this.addCommand({
			id: "pagina-export-current-note",
			name: "Export current note to PDF",
			checkCallback: (checking) => {
				const file = this.getActiveMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.openExportModal(file);
				}
				return true;
			},
		});

		this.addRibbonIcon("file-text", "Pagina: Export to PDF", () => {
			const file = this.getActiveMarkdownFile();
			if (!file) {
				new Notice("Pagina: open a markdown note to export");
				return;
			}
			this.openExportModal(file);
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item
						.setTitle("Export to PDF (Pagina)")
						.setIcon("file-text")
						.setSection("action")
						.onClick(() => {
							this.openExportModal(file);
						});
				});
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu) => {
				const file = this.getActiveMarkdownFile();
				if (!file) return;
				menu.addItem((item) => {
					item
						.setTitle("Export to PDF (Pagina)")
						.setIcon("file-text")
						.onClick(() => {
							this.openExportModal(file);
						});
				});
			}),
		);
	}

	async onunload(): Promise<void> {
		document.querySelectorAll(".pagina-print").forEach((el) => el.remove());
		document.getElementById("pagina-print-css")?.remove();
		document.getElementById("pagina-theme-light-patch")?.remove();
	}

	openExportModal(file: TFile): void {
		new PaginaExportModal(this.app, this, file).open();
	}

	getActiveMarkdownFile(): TFile | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file) return view.file;
		const file = this.app.workspace.getActiveFile();
		if (file instanceof TFile && file.extension === "md") return file;
		return null;
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
