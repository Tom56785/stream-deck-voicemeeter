import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Reads a string value from the Windows registry using `reg query`.
 * @param key Full key path, e.g. `HKCU\Software\...`.
 * @param name Name of the value to read.
 * @returns The value, or `undefined` when the key or value doesn't exist.
 */
export async function readRegistryString(key: string, name: string): Promise<string | undefined> {
	try {
		const { stdout } = await promisify(execFile)("reg", ["query", key, "/v", name], { windowsHide: true });
		return /\sREG_(?:EXPAND_)?SZ\s+(.+)/.exec(stdout)?.[1].trim();
	} catch {
		return undefined;
	}
}
