# Typewriter Paper

Typewriter-style writing in Obsidian's normal editor. It keeps your theme,
fonts and layout as they are. When you **mount** the page, the line you're
typing stays pinned near the bottom of the editor and earlier lines scroll
up, like a sheet feeding through a typewriter. When you're done, **eject**
rolls the page back up into its normal layout and tidies up trailing
whitespace.

## How to use it

1. Turn typewriter mode on with the keyboard icon in the left ribbon, or the
   command **Typewriter Paper: Toggle typewriter mode**.
2. Click **mount** on the right side of the note. The page rolls down so the
   line you're typing sits near the bottom (80% of the way down by default).
3. Write. Text scrolls up as you go, and a thin line marks the typing line.
4. Click **eject** at the right end of that line. The page rolls back to the
   top of the note in its normal layout.

You can also run the command **Mount / eject page**, and give it a hotkey
under *Settings → Hotkeys*.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Typing line position | 80% | How far down the editor the typing line stays pinned. |
| Mount on first keystroke | Off | Mount the page automatically when you start typing, instead of clicking mount. |
| Ctrl+Enter mounts / ejects | Off | Ctrl+Enter (Cmd+Enter on Mac) mounts or ejects. This borrows Obsidian's built-in Ctrl+Enter, which opens the link under the cursor in a new tab; with the cursor on a link, it still does that. |
| Trim on eject | On | When you eject, remove spaces and tabs at the ends of lines and empty lines at the end of the note. Ctrl+Z undoes it in one step. |
| Key sounds | On | Synthesized typewriter sounds: key strikes, a bell and carriage return on Enter, and a ratchet on mount and eject. No audio files are bundled. |
| Sound volume | 35% | Volume for the sounds above. |

### About trim on eject

Markdown treats two spaces at the end of a line as a line break only when
**Strict line breaks** is on (*Settings → Editor*). If you use that, turn
**Trim on eject** off so those spaces are kept.

## Notes

- Works in Live Preview and Source mode. Reading view is unaffected.
- No network requests, no data collection.
- Built for desktop. It uses no desktop-only APIs, but it hasn't been tested on mobile yet.

## Installing manually

Copy `main.js`, `manifest.json` and `styles.css` from the latest release into
`<your vault>/.obsidian/plugins/typewriter-paper/`, then enable
**Typewriter Paper** under *Settings → Community plugins*.

## License

[MIT](LICENSE)
