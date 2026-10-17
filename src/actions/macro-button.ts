import {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";

import type { Voicemeeter } from "../voicemeeter";

/**
 * Presses a Voicemeeter macro button, and keeps the key's state (0 = OFF, 1 = ON) in sync with the button.
 *
 * The plugin never sets a title or image. Both come from the user's Stream Deck settings for each state, so the title position, font
 * and icon library all work as they do for built-in actions.
 */
@action({ UUID: "com.thomasalbans.voicemeeter-macros.macro-button" })
export class MacroButton extends SingletonAction<MacroButtonSettings> {
	readonly #voicemeeter: Voicemeeter;

	/**
	 * Settings of the visible keys, by action ID, so they can be refreshed when Voicemeeter reports a change.
	 */
	readonly #settings = new Map<string, MacroButtonSettings>();

	/**
	 * Last state sent to each key, by action ID, to avoid sending the same state on every change.
	 */
	readonly #shownStates = new Map<string, 0 | 1>();

	constructor(voicemeeter: Voicemeeter) {
		super();
		this.#voicemeeter = voicemeeter;
		voicemeeter.onChange(() => this.#refreshAll());
	}

	override onWillAppear(ev: WillAppearEvent<MacroButtonSettings>): void {
		this.#settings.set(ev.action.id, ev.payload.settings);
		this.#voicemeeter.startPolling();

		if (ev.action.isKey()) {
			this.#refresh(ev.action, ev.payload.settings);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<MacroButtonSettings>): void {
		this.#settings.delete(ev.action.id);
		this.#shownStates.delete(ev.action.id);

		if (this.#settings.size === 0) {
			this.#voicemeeter.stopPolling();
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<MacroButtonSettings>): void {
		this.#settings.set(ev.action.id, ev.payload.settings);
		this.#shownStates.delete(ev.action.id);

		if (ev.action.isKey()) {
			this.#refresh(ev.action, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<MacroButtonSettings>): Promise<void> {
		const { settings } = ev.payload;
		const button = parseButtonId(settings.buttonId);
		if (button === undefined) {
			await ev.action.showAlert();
			return;
		}

		let ok: boolean;
		if (settings.mode === "push") {
			ok = this.#voicemeeter.setButton(button, true);

			// Multi-actions don't hold the key, so press and release straight away.
			if (ok && ev.payload.isInMultiAction) {
				ok = this.#voicemeeter.setButton(button, false);
			} else if (ok) {
				await this.#show(ev.action, 1);
			}
		} else {
			const current = this.#voicemeeter.getButton(button);
			const target = ev.payload.isInMultiAction ? ev.payload.userDesiredState === 1 : !current;
			ok = current !== undefined && this.#voicemeeter.setButton(button, target);

			if (ok && !ev.payload.isInMultiAction) {
				await this.#show(ev.action, target ? 1 : 0);
			}
		}

		if (!ok) {
			await ev.action.showAlert();
		} else if (settings.showOk) {
			await ev.action.showOk();
		}
	}

	override async onKeyUp(ev: KeyUpEvent<MacroButtonSettings>): Promise<void> {
		const { settings } = ev.payload;
		const button = parseButtonId(settings.buttonId);
		if (settings.mode !== "push" || ev.payload.isInMultiAction || button === undefined) {
			return;
		}

		if (this.#voicemeeter.setButton(button, false)) {
			await this.#show(ev.action, 0);
		} else {
			await ev.action.showAlert();
		}
	}

	#refreshAll(): void {
		for (const action of this.actions) {
			const settings = this.#settings.get(action.id);
			if (settings && action.isKey()) {
				this.#refresh(action, settings);
			}
		}
	}

	#refresh(action: KeyAction<MacroButtonSettings>, settings: MacroButtonSettings): void {
		const button = parseButtonId(settings.buttonId);
		if (button === undefined || action.isInMultiAction()) {
			return;
		}

		const on = this.#voicemeeter.getButton(button);
		if (on !== undefined) {
			void this.#show(action, on ? 1 : 0);
		}
	}

	async #show(action: KeyAction<MacroButtonSettings>, state: 0 | 1): Promise<void> {
		if (this.#shownStates.get(action.id) === state) {
			return;
		}

		this.#shownStates.set(action.id, state);
		await action.setState(state);
	}
}

/**
 * Settings for {@link MacroButton}, written by `ui/macro-button.html`.
 */
type MacroButtonSettings = {
	/**
	 * Logical ID of the macro button, as shown in Voicemeeter Macro Buttons (0-79). Text fields store it as a string.
	 */
	buttonId?: number | string;

	/**
	 * `toggle` flips the button on each press; `push` holds it ON while the key is held.
	 */
	mode?: "toggle" | "push";

	/**
	 * Whether to show Stream Deck's checkmark after a successful press.
	 */
	showOk?: boolean;
};

/**
 * Parses the button ID setting; a missing ID means button 0, matching the property inspector's default.
 */
function parseButtonId(value: MacroButtonSettings["buttonId"]): number | undefined {
	const id = Number(value ?? 0);
	return value !== "" && Number.isInteger(id) && id >= 0 ? id : undefined;
}
