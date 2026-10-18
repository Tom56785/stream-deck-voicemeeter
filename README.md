# Voicemeeter Macros for Stream Deck

A Stream Deck plugin with one action, **Macro Button**, that presses a [Voicemeeter](https://vb-audio.com/Voicemeeter/) macro button and shows whether it is on or off.

Unlike other Voicemeeter plugins, it never draws its own title or image. The key has two states, **Off** and **On**, and the plugin only switches between them to match Voicemeeter. As a result:

- Titles work like any other action: you choose the text, position (top, middle or bottom), font and colour per state.
- Icons come from Stream Deck's normal image menu per state, including the Icon Library.
- Stream Deck's checkmark after a press is optional (off by default).

## Settings

| Setting | Description |
|---|---|
| Button | The macro button to press, listed by its logical ID and name. Named buttons come first, followed by an "Unnamed buttons" group. The names are read from `Documents\Voicemeeter\MacroButtonConfig.xml`; press refresh after renaming a button. If that file can't be read, the list shows Button 0 to Button 79. |
| Mode | **Toggle** flips the button on each press. **Push** holds it on while the key is held. |
| Toggle again on release | Toggle mode only. Pressing the key toggles the button straight away as usual; if you hold it for at least the **Hold time**, releasing it toggles the button again. Off by default. |
| Hold time (ms) | How long, in milliseconds, the key must be held for its release to toggle the button again (1000 = 1 second). Defaults to 2000. |
| Show checkmark after press | Shows Stream Deck's checkmark after a successful press. |

If the button can't be pressed (for example Voicemeeter isn't running), the key shows Stream Deck's warning triangle.

In a multi-action, Toggle mode sets the state you pick for that step. Push mode presses and releases the button straight away.

## Requirements

- Windows 10 or later, with Voicemeeter (Standard, Banana or Potato) installed.
- Stream Deck 7.1 or later.

## Development

Requires Node.js 20 or later. Stream Deck runs the plugin with its own bundled Node.js 24.

```sh
npm install
npm run build      # bundle src/ into com.thomasalbans.voicemeeter-macros.sdPlugin/bin
npm run typecheck  # type-check without building
npm run validate   # check the plugin folder against Elgato's rules
npm run pack       # build and package dist/com.thomasalbans.voicemeeter-macros.streamDeckPlugin
```

To run your local copy in Stream Deck:

```sh
npm run dev:enable     # turn on developer mode (once)
npm run link           # install the plugin folder into Stream Deck as a link (once)
npm run watch          # rebuild and restart the plugin on every change
```

After a one-off `npm run build`, run `npm run restart` so Stream Deck loads the new code.

Run `npm run dev:disable` to turn developer mode off again.

Plugin logs are written to `com.thomasalbans.voicemeeter-macros.sdPlugin/logs`.

### How it works

- `src/voicemeeter.ts` calls the Voicemeeter Remote API (`VoicemeeterRemote64.dll`) through [Koffi](https://koffi.dev/). It finds the install folder from Voicemeeter's uninstall registry entry. While a Macro Button key is visible, it asks Voicemeeter every 100 ms whether any macro button changed.
- `src/actions/macro-button.ts` handles key presses and calls `setState` to keep each key in step with its button. It also supplies the items for the settings panel's button dropdown.
- `src/macro-button-config.ts` reads button names from Voicemeeter Macro Buttons' config file. The Remote API has no way to read them.
- Rollup bundles Koffi's JavaScript, but its native binary can't be bundled, so the build copies `@koromix/koffi-win32-x64` into `bin/node_modules`, where Koffi looks for it.
- `ui/sdpi-components.js` is a local copy of [sdpi-components](https://sdpi-components.dev/) v4, so the settings panel works offline.
