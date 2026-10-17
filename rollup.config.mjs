import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.thomasalbans.voicemeeter-macros.sdPlugin";

/**
 * Koffi's JavaScript is bundled, but its native binary can't be. At runtime Koffi asks for it with
 * `require("@koromix/koffi-win32-x64")` relative to the bundle, so ship that package in `bin/node_modules`.
 */
const koffiNative = "@koromix/koffi-win32-x64";
const koffiNativeFiles = ["package.json", "index.js", "win32_x64/koffi.node"];

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		},
		{
			// Copied rather than emitted: Windows locks koffi.node while the plugin runs, so only overwrite it when it changed.
			name: "copy-koffi-native",
			writeBundle() {
				for (const file of koffiNativeFiles) {
					const source = fs.readFileSync(`node_modules/${koffiNative}/${file}`);
					const target = `${sdPlugin}/bin/node_modules/${koffiNative}/${file}`;
					if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) {
						continue;
					}

					fs.mkdirSync(path.dirname(target), { recursive: true });
					fs.writeFileSync(target, source);
				}
			}
		}
	]
};

export default config;
