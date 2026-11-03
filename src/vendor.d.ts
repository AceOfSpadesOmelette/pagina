declare module "*.wasm" {
	const bytes: Uint8Array;
	export default bytes;
}

declare module "*.cjs" {
	interface WoffVector {
		size: () => number;
		get: (index: number) => number;
	}
	interface WoffModule {
		woff2Dec: (buffer: Uint8Array, length: number) => WoffVector;
		onRuntimeInitialized?: () => void;
	}
	const factory: (opts: { wasmBinary: Uint8Array }) => WoffModule;
	export default factory;
}

declare module "electron" {
	interface ElectronModule {
		ipcRenderer?: {
			send: (channel: string, ...args: unknown[]) => void;
			once: (channel: string, listener: (event: unknown, result?: unknown) => void) => void;
		};
		remote?: {
			dialog?: {
				showSaveDialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }>;
			};
			shell?: { openPath: (filePath: string) => Promise<string> };
		};
		shell?: { openPath: (filePath: string) => Promise<string> };
	}
	const electron: ElectronModule;
	export default electron;
}

declare module "fs" {
	export interface Dirent {
		name: string;
		isDirectory(): boolean;
	}
	export const promises: {
		writeFile(path: string, data: Uint8Array): Promise<void>;
		access(path: string): Promise<void>;
		readFile(path: string): Promise<Uint8Array>;
		unlink(path: string): Promise<void>;
		readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
	};
}

declare module "path" {
	export function join(...parts: string[]): string;
	export function basename(file: string, ext?: string): string;
	export function extname(file: string): string;
	export function isAbsolute(file: string): boolean;
}

declare module "os" {
	export function tmpdir(): string;
	export function homedir(): string;
	export function platform(): string;
}

declare const process: {
	platform: string;
	env: Record<string, string | undefined>;
};
