/** @type {import("jest").Config} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/*.test.ts"],
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/__mocks__/obsidian.ts",
		"^electron$": "<rootDir>/__mocks__/electron.ts",
		"^.*/woff2-ttf$": "<rootDir>/__mocks__/woff2-ttf.ts",
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: {
					module: "commonjs",
					esModuleInterop: true,
					isolatedModules: true,
				},
			},
		],
	},
};
