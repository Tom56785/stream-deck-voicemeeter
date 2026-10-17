import streamDeck from "@elgato/streamdeck";

import { MacroButton } from "./actions/macro-button";
import { Voicemeeter } from "./voicemeeter";

// "trace" records every message between Stream Deck and the plugin, which helps when debugging.
streamDeck.logger.setLevel("info");

const voicemeeter = new Voicemeeter();
streamDeck.actions.registerAction(new MacroButton(voicemeeter));

voicemeeter.connect().catch((err) => streamDeck.logger.error(`Couldn't connect to Voicemeeter: ${err}`));
process.on("exit", () => voicemeeter.disconnect());

streamDeck.connect();
