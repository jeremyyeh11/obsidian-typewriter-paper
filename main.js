/* Typewriter Paper — Obsidian plugin (plain JS, no build step).
 * Leaves the theme alone. "Mount" rolls the page down so the line you're typing
 * stays pinned near the bottom of the editor; "eject" rolls it back up. */
"use strict";

const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const { ViewPlugin, EditorView, keymap } = require("@codemirror/view");
const { Prec } = require("@codemirror/state");

const DEFAULTS = {
  v: 2,
  enabled: false,
  linePosition: 0.8, // where the typing line sits, as a fraction of editor height
  autoFeed: false, // mount the page automatically on the first keystroke
  ctrlEnter: false, // opt-in: Ctrl/Cmd+Enter mounts or ejects (unless the cursor is on a link)
  trimOnEject: true, // strip trailing spaces and trailing blank lines when ejecting
  sounds: true,
  volume: 0.35,
};

/* ---------- synthesized typewriter sounds (no audio files) ---------- */
class TypewriterSounds {
  constructor(plugin) {
    this.plugin = plugin;
    this.ctx = null;
  }
  ensure() {
    if (!this.plugin.settings.sounds) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  noiseBurst(ctx, t, dur, freq, q, gain) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }
  thunk(ctx, t, freq, dur, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  key() {
    const ctx = this.ensure();
    if (!ctx) return;
    const v = this.plugin.settings.volume;
    const t = ctx.currentTime;
    const jitter = 0.85 + Math.random() * 0.3;
    this.noiseBurst(ctx, t, 0.035, 2600 * jitter, 1.2, 0.9 * v);
    this.thunk(ctx, t, 140 * jitter, 0.05, 0.5 * v);
  }
  space() {
    const ctx = this.ensure();
    if (!ctx) return;
    const v = this.plugin.settings.volume;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.04, 900, 0.8, 0.6 * v);
    this.thunk(ctx, t, 90, 0.06, 0.45 * v);
  }
  carriageReturn() {
    const ctx = this.ensure();
    if (!ctx) return;
    const v = this.plugin.settings.volume;
    const t = ctx.currentTime;
    for (const [f, a] of [[2093, 0.35], [4186, 0.12], [3136, 0.08]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(a * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.2);
    }
    this.noiseBurst(ctx, t + 0.05, 0.28, 1400, 0.6, 0.35 * v);
    this.noiseBurst(ctx, t + 0.34, 0.04, 2200, 1.5, 0.8 * v);
    this.thunk(ctx, t + 0.34, 110, 0.07, 0.5 * v);
  }
  eject() {
    const ctx = this.ensure();
    if (!ctx) return;
    const v = this.plugin.settings.volume;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.03, 2400, 1.5, 0.7 * v); // paper release lever
    for (let i = 0; i < 9; i++) {
      // platen ratchet as the sheet rolls out, slowing slightly
      const ti = t + 0.06 + i * (0.05 + i * 0.004);
      this.noiseBurst(ctx, ti, 0.018, 3200 + Math.random() * 600, 2, 0.45 * v);
    }
    this.noiseBurst(ctx, t + 0.08, 0.55, 5000, 0.4, 0.12 * v); // paper slide
  }
  mount() {
    const ctx = this.ensure();
    if (!ctx) return;
    const v = this.plugin.settings.volume;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      // platen knob ratchet as the sheet is wound in
      this.noiseBurst(ctx, t + i * 0.055, 0.018, 2900 + Math.random() * 500, 2, 0.45 * v);
    }
    this.thunk(ctx, t + 0.34, 120, 0.06, 0.4 * v); // paper bail snaps down
    this.noiseBurst(ctx, t + 0.34, 0.03, 2000, 1.4, 0.6 * v);
  }
  close() {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}

/* Typewriter icons in Obsidian's line style (24px grid, currentColor stroke):
 * a platen roller with its two knobs, and a sheet being wound in (mount) or out (eject).
 * Built with the DOM API rather than HTML strings. */
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PARTS = {
  common: [
    ["path", { d: "M7 13.5V2.5h10v11" }], // sheet
    ["rect", { x: "4.5", y: "13.5", width: "15", height: "5", rx: "2.5" }], // platen
    ["circle", { cx: "2.25", cy: "16", r: "1", fill: "currentColor" }], // knobs
    ["circle", { cx: "21.75", cy: "16", r: "1", fill: "currentColor" }],
    ["path", { d: "M8.5 21.5h7" }], // paper table
  ],
  mount: [["path", { d: "M12 5v5.5" }], ["path", { d: "m9.5 8 2.5 2.5L14.5 8" }]],
  eject: [["path", { d: "M12 10.5V5" }], ["path", { d: "m9.5 7.5 2.5-2.5 2.5 2.5" }]],
};

function makeIcon(kind) {
  const svg = document.createElementNS(SVG_NS, "svg");
  const attrs = {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round",
  };
  for (const k in attrs) svg.setAttribute(k, attrs[k]);
  for (const [tag, a] of [...ICON_PARTS.common, ...ICON_PARTS[kind]]) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in a) el.setAttribute(k, a[k]);
    svg.appendChild(el);
  }
  return svg;
}

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/* ---------- editor extension ---------- */
function buildViewPlugin(plugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.ejected = true; // notes open in their normal layout
        this.feeding = false;
        this.ejecting = false; // eject roll in progress
        this.pendingScroll = false;
        this.anim = null;

        this.layer = document.createElement("div");
        this.layer.className = "tw-layer";
        this.rail = this.layer.appendChild(document.createElement("div"));
        this.rail.className = "tw-rail";
        this.btn = this.layer.appendChild(document.createElement("button"));
        this.btn.className = "tw-page-btn";
        this.btnIcon = this.btn.appendChild(document.createElement("span"));
        this.btnIcon.className = "tw-page-btn-icon";
        this.btnLabel = this.btn.appendChild(document.createElement("span"));
        this.btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep editor focus
        this.btn.addEventListener("click", (e) => {
          e.preventDefault();
          this.togglePage();
        });
        view.dom.appendChild(this.layer);
        this.setEjected(true);

        this.onScroll = () => this.schedule(false);
        view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
        this.schedule(false);
      }

      update(u) {
        if (this.trimming) return; // our own clean-up edit on eject; not typing
        const typed = u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'));
        if (u.docChanged && typed && this.ejected && plugin.settings.autoFeed) {
          plugin.audio.mount();
          this.setEjected(false);
          this.feeding = true;
        }
        if (this.ejected) {
          if (u.geometryChanged || u.viewportChanged) this.schedule(false);
          return;
        }
        let scroll = u.docChanged;
        for (const tr of u.transactions) {
          if (tr.selection && !tr.isUserEvent("select.pointer")) scroll = true;
        }
        if (scroll) {
          this.stopAnim(); // typing interrupts any roll; the page stays mounted
          this.ejecting = false;
        }
        if (scroll || u.selectionSet || u.geometryChanged || u.viewportChanged) this.schedule(scroll);
      }

      // CodeMirror rewrites the outer editor's class list, so the flag lives on the scroller
      setEjected(on) {
        this.ejected = on;
        this.view.scrollDOM.classList.toggle("tw-ejected", on);
        this.layer.classList.toggle("is-ejected", on);
        this.btnLabel.textContent = on ? "mount" : "eject";
        this.btn.setAttribute("aria-label", on ? "Mount page" : "Eject page");
        this.btnIcon.replaceChildren(makeIcon(on ? "mount" : "eject"));
      }

      togglePage() {
        const now = performance.now();
        if (plugin.lastToggleAt != null && now - plugin.lastToggleAt < 200) return; // same keypress arriving twice
        plugin.lastToggleAt = now;
        this.ejected || this.ejecting ? this.mount() : this.eject();
      }

      mount() {
        if (!this.ejected && !this.ejecting) return;
        this.stopAnim();
        plugin.audio.mount();
        if (this.ejecting) {
          // reversed mid-roll: the spacer is still there, just roll back to the typing line
          this.ejecting = false;
        } else {
          this.setEjected(false);
          this.feeding = true;
        }
        this.schedule(true);
        this.view.focus();
      }

      spacerHeight() {
        const sizer = this.view.scrollDOM.querySelector(".cm-sizer");
        if (!sizer) return 0;
        return parseFloat(getComputedStyle(sizer, "::before").height) || 0;
      }

      stopAnim() {
        if (this.anim) cancelAnimationFrame(this.anim);
        this.anim = null;
      }

      animateScroll(from, to, ms, done) {
        this.stopAnim();
        const sc = this.view.scrollDOM;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          sc.scrollTop = from + (to - from) * easeInOut(k);
          if (k < 1) this.anim = requestAnimationFrame(step);
          else {
            this.anim = null;
            done && done();
          }
        };
        this.anim = requestAnimationFrame(step);
      }

      // One undoable edit: trailing spaces/tabs off every line, then any blank
      // lines at the end of the note. Strict line breaks are off in this vault,
      // so trailing double spaces carry no meaning.
      trimTrailing() {
        const doc = this.view.state.doc;
        let last = doc.lines;
        while (last > 1 && doc.line(last).text.trim() === "") last--;
        const changes = [];
        for (let i = 1; i <= last; i++) {
          const line = doc.line(i);
          const m = /[ \t]+$/.exec(line.text);
          if (m) changes.push({ from: line.from + m.index, to: line.to });
        }
        const end = doc.line(last).to;
        if (end < doc.length) changes.push({ from: end, to: doc.length });
        if (!changes.length) return 0;
        this.trimming = true;
        try {
          this.view.dispatch({ changes, userEvent: "delete.trim" });
        } finally {
          this.trimming = false;
        }
        return changes.length;
      }

      eject() {
        if (this.ejected || this.ejecting) return;
        if (plugin.settings.trimOnEject) this.trimTrailing();
        this.ejecting = true;
        plugin.audio.eject();
        const sc = this.view.scrollDOM;
        const h = this.spacerHeight();
        this.animateScroll(sc.scrollTop, h, 650, () => {
          // the page is now at its normal resting place; drop the spacer without a visible jump
          this.ejecting = false;
          this.setEjected(true);
          sc.scrollTop = Math.max(0, sc.scrollTop - h);
          this.schedule(false);
        });
      }

      schedule(scroll) {
        this.pendingScroll = this.pendingScroll || scroll;
        this.view.requestMeasure({
          key: this,
          read: (view) => ({
            c: view.coordsAtPos(view.state.selection.main.head),
            sr: view.scrollDOM.getBoundingClientRect(),
            er: view.dom.getBoundingClientRect(),
            cr: view.contentDOM.getBoundingClientRect(),
            h: this.feeding ? this.spacerHeight() : 0,
          }),
          write: ({ c, sr, er, cr, h }, view) => {
            const doScroll = this.pendingScroll;
            const feeding = this.feeding;
            this.pendingScroll = false;
            this.feeding = false;
            if (this.ejected) {
              // no page mounted: park the mount button where the typing line would be
              this.place(sr.top + sr.height * plugin.settings.linePosition, er, cr);
              return;
            }
            if (!c) return;
            const sc = view.scrollDOM;
            let bottom = c.bottom;
            if (doScroll && sr.height > 0) {
              const targetY = sr.top + sr.height * plugin.settings.linePosition;
              const delta = c.bottom - targetY;
              const before = sc.scrollTop;
              if (feeding) {
                // the spacer just pushed the page down by h: hold it visually, then roll it to the line
                const from = before + h;
                sc.scrollTop = from;
                bottom = c.bottom - (sc.scrollTop - before);
                this.animateScroll(from, before + delta, 320);
              } else if (Math.abs(delta) > 1) {
                sc.scrollTop = before + delta;
                bottom -= sc.scrollTop - before;
              }
            }
            this.place(bottom, er, cr);
          },
        });
      }

      place(bottom, er, cr) {
        const y = bottom - er.top + 6;
        const s = this.layer.style;
        s.setProperty("--tw-rail-y", y + "px");
        s.setProperty("--tw-rail-x", cr.left - er.left + "px");
        s.setProperty("--tw-rail-w", cr.width + "px");
      }

      destroy() {
        this.stopAnim();
        this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
        this.layer.remove();
        this.view.scrollDOM.classList.remove("tw-ejected");
      }
    }
  );
}

function buildKeySounds(plugin) {
  return EditorView.domEventHandlers({
    keydown(e) {
      if (!plugin.settings.sounds || e.ctrlKey || e.metaKey || e.altKey || (e.repeat && e.key !== "Backspace")) return false;
      if (e.key === "Enter") plugin.audio.carriageReturn();
      else if (e.key === " ") plugin.audio.space();
      else if (e.key.length === 1 || e.key === "Backspace" || e.key === "Tab") plugin.audio.key();
      return false; // never swallow the key
    },
  });
}

function buildShortcut(plugin) {
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: (view) => {
          if (!plugin.settings.ctrlEnter || plugin.cursorOnLink()) return false; // let Obsidian open the link
          const vp = view.plugin(plugin.viewPlugin);
          if (!vp) return false;
          vp.togglePage();
          return true;
        },
      },
    ])
  );
}

/* ---------- plugin ---------- */
module.exports = class TypewriterPaperPlugin extends Plugin {
  async onload() {
    const saved = (await this.loadData()) || {};
    if (saved.v !== 2) {
      // v1 restyled the whole editor; v2 keeps only the behaviour
      delete saved.glow;
      delete saved.hideSidebars;
      saved.linePosition = DEFAULTS.linePosition;
      saved.v = 2;
    }
    this.settings = Object.assign({}, DEFAULTS, saved);
    await this.saveData(this.settings);

    this.audio = new TypewriterSounds(this);
    this.viewPlugin = buildViewPlugin(this);
    this.extension = [];
    this.registerEditorExtension(this.extension);

    this.ribbon = this.addRibbonIcon("keyboard", "Toggle typewriter mode", () => this.toggle());
    this.addCommand({
      id: "toggle-typewriter-mode",
      name: "Toggle typewriter mode",
      callback: () => this.toggle(),
    });
    this.addCommand({
      id: "mount-eject-page",
      name: "Mount / eject page",
      checkCallback: (checking) => {
        const cm = this.activeCM();
        const vp = cm && cm.plugin(this.viewPlugin);
        if (!vp) return false;
        if (!checking) vp.togglePage();
        return true;
      },
    });
    this.addSettingTab(new TypewriterPaperSettings(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.apply();
      this.claimCtrlEnter();
    });
  }

  activeVP() {
    const cm = this.activeCM();
    return (cm && cm.plugin && cm.plugin(this.viewPlugin)) || null;
  }

  /* Obsidian binds Ctrl/Cmd+Enter to its own "Open link under cursor in new tab"
   * command and handles the key before the editor sees it. Wrap that command:
   * with typewriter mode on and no link under the cursor, Ctrl+Enter mounts or
   * ejects; on a link (or with the mode off) Obsidian's behaviour is unchanged. */
  claimCtrlEnter() {
    const cmds = this.app.commands && this.app.commands.commands;
    const cmd = cmds && cmds["editor:open-link-in-new-leaf"];
    if (!cmd || cmd.__typewriterWrapped) return;
    const plugin = this;
    const original = cmd.checkCallback;
    const originalCallback = cmd.callback;
    cmd.checkCallback = function (checking) {
      if (plugin.settings.enabled && plugin.settings.ctrlEnter && !plugin.cursorOnLink()) {
        const vp = plugin.activeVP();
        if (vp) {
          if (!checking) vp.togglePage();
          return true;
        }
      }
      if (original) return original.call(this, checking);
      if (originalCallback) {
        if (!checking) originalCallback.call(this);
        return true;
      }
      return false;
    };
    cmd.__typewriterWrapped = true;
    this.register(() => {
      cmd.checkCallback = original;
      delete cmd.__typewriterWrapped;
    });
  }

  activeCM() {
    const ed = this.app.workspace.activeEditor;
    return ed && ed.editor && ed.editor.cm;
  }

  cursorOnLink() {
    const ed = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor;
    try {
      return !!(ed && ed.getClickableTokenAt && ed.getClickableTokenAt(ed.getCursor()));
    } catch (e) {
      return false;
    }
  }

  onunload() {
    document.body.classList.remove("typewriter-paper");
    document.body.style.removeProperty("--tw-pos");
    this.audio.close();
  }

  async toggle() {
    this.settings.enabled = !this.settings.enabled;
    await this.saveData(this.settings);
    this.apply();
    new Notice(this.settings.enabled ? "Typewriter mode on: click mount to start" : "Typewriter mode off", 2200);
  }

  apply() {
    const on = this.settings.enabled;
    document.body.classList.toggle("typewriter-paper", on);
    document.body.style.setProperty("--tw-pos", String(this.settings.linePosition));
    this.ribbon && this.ribbon.classList.toggle("is-active", on);
    this.extension.length = 0;
    if (on) this.extension.push(this.viewPlugin, buildKeySounds(this), buildShortcut(this));
    this.app.workspace.updateOptions();
  }

  async saveAndApply() {
    await this.saveData(this.settings);
    this.apply();
  }
};

class TypewriterPaperSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Typing line position")
      .setDesc("How far down the editor the line you're typing stays pinned.")
      .addSlider((s) =>
        s.setLimits(30, 90, 1).setValue(Math.round(p.settings.linePosition * 100)).setDynamicTooltip()
          .onChange(async (v) => { p.settings.linePosition = v / 100; await p.saveAndApply(); })
      );
    new Setting(containerEl)
      .setName("Mount on first keystroke")
      .setDesc("Roll the page down automatically when you start typing. When off, use the mount button or the shortcut.")
      .addToggle((t) => t.setValue(p.settings.autoFeed).onChange(async (v) => { p.settings.autoFeed = v; await p.saveData(p.settings); }));
    new Setting(containerEl)
      .setName("Ctrl+Enter mounts / ejects")
      .setDesc("Ctrl+Enter (Cmd+Enter on Mac) mounts or ejects the page. This borrows Obsidian's built-in Ctrl+Enter, which opens the link under the cursor in a new tab: on a link it still does that. To use a different key instead, leave this off and assign one to 'Mount / eject page' under Settings > Hotkeys.")
      .addToggle((t) => t.setValue(p.settings.ctrlEnter).onChange(async (v) => { p.settings.ctrlEnter = v; await p.saveData(p.settings); }));
    new Setting(containerEl)
      .setName("Trim on eject")
      .setDesc("When you eject, remove spaces at the ends of lines and empty lines at the end of the note. Ctrl+Z undoes it.")
      .addToggle((t) => t.setValue(p.settings.trimOnEject).onChange(async (v) => { p.settings.trimOnEject = v; await p.saveData(p.settings); }));
    new Setting(containerEl)
      .setName("Key sounds")
      .setDesc("Synthesized key strikes, a bell and carriage return on Enter, and a ratchet on mount and eject.")
      .addToggle((t) => t.setValue(p.settings.sounds).onChange(async (v) => { p.settings.sounds = v; await p.saveData(p.settings); }));
    new Setting(containerEl)
      .setName("Sound volume")
      .addSlider((s) =>
        s.setLimits(0, 100, 5).setValue(Math.round(p.settings.volume * 100)).setDynamicTooltip()
          .onChange(async (v) => { p.settings.volume = v / 100; await p.saveData(p.settings); })
      );
  }
}
