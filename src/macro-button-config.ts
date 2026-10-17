import streamDeck from "@elgato/streamdeck";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readRegistryString } from "./registry";

const logger = streamDeck.logger.createScope("MacroButtonConfig");

/**
 * Explorer's resolved shell folders; `Personal` is the Documents folder, which may have been moved (e.g. to OneDrive).
 */
const SHELL_FOLDERS_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders`;

/**
 * Number of buttons Voicemeeter Macro Buttons has, used when its config can't be read.
 */
const DEFAULT_BUTTON_COUNT = 80;

/**
 * A macro button as configured in Voicemeeter Macro Buttons.
 */
export type MacroButtonInfo = {
	/**
	 * Logical ID used by the Remote API (0-79).
	 */
	id: number;

	/**
	 * Name shown on the button; empty when the button hasn't been named.
	 */
	name: string;

	/**
	 * Second line shown under the name; empty when not set.
	 */
	subname: string;
};

/**
 * Reads the macro buttons from Voicemeeter Macro Buttons' config (`Documents\Voicemeeter\MacroButtonConfig.xml`). Falls back to
 * unnamed buttons 0-79 when the config can't be read.
 */
export async function readMacroButtons(): Promise<MacroButtonInfo[]> {
	const documents = (await readRegistryString(SHELL_FOLDERS_KEY, "Personal")) ?? path.join(os.homedir(), "Documents");
	const configPath = path.join(documents, "Voicemeeter", "MacroButtonConfig.xml");

	try {
		const buttons = parseMacroButtonConfig(await fs.readFile(configPath, "utf8"));
		if (buttons.length > 0) {
			return buttons;
		}

		logger.warn(`No macro buttons found in ${configPath}`);
	} catch (err) {
		logger.warn(`Couldn't read ${configPath}: ${err}`);
	}

	return Array.from({ length: DEFAULT_BUTTON_COUNT }, (_, id) => ({ id, name: "", subname: "" }));
}

/**
 * Parses `MacroButtonConfig.xml`. Each `<MacroButton>` has a 1-based `index` attribute, one more than the button's logical ID.
 */
function parseMacroButtonConfig(xml: string): MacroButtonInfo[] {
	const buttons: MacroButtonInfo[] = [];
	for (const [, index, body] of xml.matchAll(/<MacroButton\s[^>]*\bindex=['"](\d+)['"][^>]*>([\s\S]*?)<\/MacroButton>/g)) {
		buttons.push({
			id: Number(index) - 1,
			name: readElementText(body, "MB_Name"),
			subname: readElementText(body, "MB_Subname")
		});
	}

	return buttons.sort((a, b) => a.id - b.id);
}

function readElementText(xml: string, element: string): string {
	const text = new RegExp(`<${element}>([\\s\\S]*?)</${element}>`).exec(xml)?.[1] ?? "";
	return decodeXmlEntities(text).replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(text: string): string {
	const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
		if (code[0] !== "#") {
			return named[code] ?? entity;
		}

		return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
	});
}
