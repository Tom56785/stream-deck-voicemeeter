import streamDeck from "@elgato/streamdeck";
import koffi from "koffi";
import path from "node:path";

import { readRegistryString } from "./registry";

const logger = streamDeck.logger.createScope("Voicemeeter");

/**
 * Uninstall entry written by the Voicemeeter installer; its `UninstallString` points at the setup exe inside the install folder.
 */
const UNINSTALL_KEY = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\VB:Voicemeeter {17359A74-1236-5467}`;
const DEFAULT_INSTALL_DIR = String.raw`C:\Program Files (x86)\VB\Voicemeeter`;

/**
 * `bitmode` for the macro button functions: read or write the button's ON/OFF state. Writing it runs the button's ON or OFF request,
 * exactly as clicking it in Voicemeeter Macro Buttons would.
 */
const MACROBUTTON_MODE_DEFAULT = 0x00000000;

/**
 * How often to ask Voicemeeter whether any macro button changed, while at least one key is visible.
 */
const POLL_INTERVAL_MS = 100;

type RemoteApi = {
	login: () => number;
	logout: () => number;
	macroButtonIsDirty: () => number;
	macroButtonGetStatus: (button: number, value: [number], bitmode: number) => number;
	macroButtonSetStatus: (button: number, value: number, bitmode: number) => number;
};

/**
 * Wrapper around the Voicemeeter Remote API (`VoicemeeterRemote64.dll`), limited to macro buttons.
 */
export class Voicemeeter {
	#api?: RemoteApi;
	#online = false;
	#timer?: NodeJS.Timeout;
	readonly #listeners = new Set<() => void>();

	/**
	 * Loads the Remote API and logs in. Login succeeds even when Voicemeeter isn't running yet; the API connects once it starts.
	 */
	async connect(): Promise<void> {
		if (this.#api) {
			return;
		}

		const dllPath = path.join(await findInstallDir(), "VoicemeeterRemote64.dll");
		const lib = koffi.load(dllPath);
		const api: RemoteApi = {
			login: lib.func("long __stdcall VBVMR_Login(void)"),
			logout: lib.func("long __stdcall VBVMR_Logout(void)"),
			macroButtonIsDirty: lib.func("long __stdcall VBVMR_MacroButton_IsDirty(void)"),
			macroButtonGetStatus: lib.func("long __stdcall VBVMR_MacroButton_GetStatus(long nuLogicalButton, _Out_ float *pValue, long bitmode)"),
			macroButtonSetStatus: lib.func("long __stdcall VBVMR_MacroButton_SetStatus(long nuLogicalButton, float fValue, long bitmode)")
		};

		// 0: OK, 1: OK but Voicemeeter isn't running, -2: already logged in from this process.
		const result = api.login();
		if (result !== 0 && result !== 1 && result !== -2) {
			throw new Error(`VBVMR_Login failed (${result})`);
		}

		logger.info(`Logged in using ${dllPath} (${result === 1 ? "Voicemeeter not running yet" : "Voicemeeter running"})`);
		this.#api = api;
	}

	disconnect(): void {
		this.stopPolling();
		this.#api?.logout();
		this.#api = undefined;
		this.#online = false;
	}

	/**
	 * Registers a listener called whenever a macro button may have changed state, or Voicemeeter starts or stops answering.
	 */
	onChange(listener: () => void): void {
		this.#listeners.add(listener);
	}

	startPolling(): void {
		this.#timer ??= setInterval(() => this.#poll(), POLL_INTERVAL_MS);
	}

	stopPolling(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	/**
	 * Reads a macro button's state.
	 * @param button Logical ID of the button, as shown in Voicemeeter Macro Buttons (0-79).
	 * @returns `true` when ON, `false` when OFF, or `undefined` when the state can't be read.
	 */
	getButton(button: number): boolean | undefined {
		if (!this.#api) {
			return undefined;
		}

		const value: [number] = [0];
		const result = this.#api.macroButtonGetStatus(button, value, MACROBUTTON_MODE_DEFAULT);
		return result === 0 ? value[0] !== 0 : undefined;
	}

	/**
	 * Sets a macro button's state, which runs its ON or OFF request.
	 * @returns `true` when Voicemeeter accepted the change.
	 */
	setButton(button: number, on: boolean): boolean {
		if (!this.#api) {
			return false;
		}

		const result = this.#api.macroButtonSetStatus(button, on ? 1 : 0, MACROBUTTON_MODE_DEFAULT);
		if (result !== 0) {
			logger.warn(`VBVMR_MacroButton_SetStatus(${button}, ${on}) failed (${result})`);
		}

		return result === 0;
	}

	#poll(): void {
		if (!this.#api) {
			return;
		}

		// >0: something changed, 0: nothing changed, <0: Voicemeeter isn't answering.
		const dirty = this.#api.macroButtonIsDirty();
		const online = dirty >= 0;
		const wentOnline = online !== this.#online;
		this.#online = online;

		if (dirty > 0 || wentOnline) {
			this.#listeners.forEach((listener) => listener());
		}
	}
}

/**
 * Finds the Voicemeeter install folder from its uninstall entry, falling back to the default location.
 */
async function findInstallDir(): Promise<string> {
	const uninstallString = await readRegistryString(UNINSTALL_KEY, "UninstallString");
	if (uninstallString) {
		return path.dirname(uninstallString.replace(/^"|"$/g, ""));
	}

	logger.warn(`Couldn't read Voicemeeter's install folder from the registry, using ${DEFAULT_INSTALL_DIR}`);
	return DEFAULT_INSTALL_DIR;
}
