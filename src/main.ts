import { MarkdownView, Menu, Notice, Plugin, TFile } from "obsidian";
import { PaginaExportModal } from "./export-modal";
import { isPhoneSession } from "./session";
import { PaginaSettingTab } from "./settings";
import { DEFAULT_SETTINGS, normalizeSettings, type PaginaSettings } from "./types";

const MOBILE_DISABLED_NOTICE =
	"Pagina PDF export is desktop-only for now (mobile export is not stable yet).";

export default class PaginaPlugin extends Plugin {
	settings: PaginaSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new PaginaSettingTab(this.app, this));

		this.addCommand({
			id: "export-current-note",
			name: "Export current note to PDF",
			checkCallback: (checking) => {
				if (isPhoneSession()) return false;
				const file = this.getActiveMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.openExportModal(file);
				}
				return true;
			},
		});

		this.addRibbonIcon("file-text", "Pagina: Export to PDF", () => {
			if (isPhoneSession()) {
				new Notice(MOBILE_DISABLED_NOTICE);
				return;
			}
			const file = this.getActiveMarkdownFile();
			if (!file) {
				new Notice("Pagina: open a Markdown note to export");
				return;
			}
			this.openExportModal(file);
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file) => {
				if (isPhoneSession()) return;
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item
						.setTitle("Export to PDF (pagina)")
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
				if (isPhoneSession()) return;
				const file = this.getActiveMarkdownFile();
				if (!file) return;
				menu.addItem((item) => {
					item
						.setTitle("Export to PDF (pagina)")
						.setIcon("file-text")
						.onClick(() => {
							this.openExportModal(file);
						});
				});
			}),
		);
	}

	onunload(): void {
		document.querySelectorAll(".pagina-print").forEach((el) => el.remove());
	}

	openExportModal(file: TFile): void {
		if (isPhoneSession()) {
			new Notice(MOBILE_DISABLED_NOTICE);
			return;
		}
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
