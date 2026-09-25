/* Slide 2: the adiastematic Verovio fork renders MEI live. The deck edits one snippet
   step by step, each step a single insertion or deletion, and hands the pane over on a click. */

(() => {
const CHAR_MS = 60;
const DELETE_MS = 36;
const HOLD_MS = 2200;
const TURN_MS = 2800;
const TOOLKIT_TIMEOUT_MS = 8000;
const CARET = "";

/* One snippet, grown and pruned again: every step differs from its neighbour by
   one attribute or one element, so the rendering answers a single edit. */
const STATES = [
  {
    name: "Virga",
    mei: `<syllable>
  <neume>
    <nc tilt="ne"/>
  </neume>
</syllable>`,
  },
  {
    name: "Clivis",
    mei: `<syllable>
  <neume>
    <nc tilt="ne"/>
    <nc tilt="s" intm="d"/>
  </neume>
</syllable>`,
  },
  {
    name: "Clivis, gebogen",
    mei: `<syllable>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
  </neume>
</syllable>`,
  },
  {
    name: "Porrectus",
    mei: `<syllable>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
    <nc tilt="ne" intm="u"/>
  </neume>
</syllable>`,
  },
  {
    name: "Porrectus liquescens",
    mei: `<syllable>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
    <nc tilt="ne" intm="u">
      <liquescent curve="a"/>
    </nc>
  </neume>
</syllable>`,
  },
];

const document_for = (snippet) => `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" lines="0" notationtype="neume"/></staffGrp></scoreDef>
    <section><staff n="1"><layer>${snippet}</layer></staff></section>
  </score></mdiv></body></music>
</mei>`;

const escapeXml = (text) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const TOKENS = /(&lt;\/?)([\w:-]+)|([\w:-]+)="([^"]*)"/g;

const highlight = (text) =>
  escapeXml(text).replace(TOKENS, (match, open, tag, attribute, value) =>
    open
      ? `${open}<span class="tag">${tag}</span>`
      : `<span class="attr">${attribute}</span>="<span class="val">${value}</span>"`
  );

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const commonPrefix = (a, b) => {
  const limit = Math.min(a.length, b.length);
  const differs = Array.from({ length: limit }, (_, i) => i).find((i) => a[i] !== b[i]);
  return differs === undefined ? limit : differs;
};

const commonSuffix = (a, b, floor) => {
  const limit = Math.min(a.length, b.length) - floor;
  const differs = Array.from({ length: Math.max(limit, 0) }, (_, i) => i)
    .find((i) => a[a.length - 1 - i] !== b[b.length - 1 - i]);
  return differs === undefined ? Math.max(limit, 0) : differs;
};

class LiveNeume {
  constructor(toolkit, elements) {
    this.toolkit = toolkit;
    this.elements = elements;
    this.text = "";
    this.caret = 0;
    this.generation = 0;
    this.edited = false;
  }

  show({ caret = true } = {}) {
    const marked = caret ? this.text.slice(0, this.caret) + CARET + this.text.slice(this.caret) : this.text;
    this.elements.code.innerHTML = highlight(marked).replace(CARET, '<span class="caret"></span>');
    if (this.elements.input.value !== this.text) this.elements.input.value = this.text;
  }

  render() {
    const mei = document_for(this.text);
    const parsed = new DOMParser().parseFromString(mei, "application/xml");
    const valid = !parsed.querySelector("parsererror");
    this.elements.panel.classList.toggle("invalid", this.edited && !valid);
    if (!valid) return;
    this.toolkit.loadData(mei);
    this.elements.render.innerHTML = this.toolkit.renderToSVG(1);
  }

  name(text) {
    this.elements.name.textContent = text ?? "";
  }

  /** Turns the pane's text into `target` by editing only the part that differs. */
  async write(target, generation) {
    const start = commonPrefix(this.text, target);
    const keepEnd = commonSuffix(this.text, target, start);
    const insert = target.slice(start, target.length - keepEnd);

    this.caret = this.text.length - keepEnd;
    while (this.caret > start && this.generation === generation) {
      this.text = this.text.slice(0, this.caret - 1) + this.text.slice(this.caret);
      this.caret -= 1;
      this.show();
      this.render();
      await wait(DELETE_MS);
    }
    for (const character of insert) {
      if (this.generation !== generation) return;
      this.text = this.text.slice(0, this.caret) + character + this.text.slice(this.caret);
      this.caret += 1;
      this.show();
      this.render();
      await wait(CHAR_MS);
    }
  }

  async play() {
    if (this.edited) return;
    const generation = ++this.generation;
    const forwards = STATES;
    const backwards = STATES.slice(0, -1).reverse();
    while (this.generation === generation) {
      for (const state of [...forwards, ...backwards]) {
        await this.write(state.mei, generation);
        if (this.generation !== generation) return;
        this.name(state.name);
        await wait(state === STATES.at(-1) ? TURN_MS : HOLD_MS);
      }
    }
  }

  stop() {
    this.generation += 1;
  }

  /* A click hands the pane over to the audience; the demo stops where it is. */
  takeOver() {
    this.stop();
    this.edited = true;
    this.elements.panel.classList.add("editing");
    this.name("");
    this.show({ caret: false });
  }

  onInput() {
    this.text = this.elements.input.value;
    this.caret = this.elements.input.selectionStart ?? this.text.length;
    this.show({ caret: false });
    this.render();
  }

  restart() {
    this.edited = false;
    this.elements.panel.classList.remove("editing", "invalid");
    this.elements.input.blur();
    this.text = "";
    this.caret = 0;
    this.show();
    this.play();
  }
}

const toolkitReady = () =>
  new Promise((resolve, reject) => {
    if (!window.verovio?.module) {
      reject(new Error("Verovio toolkit not loaded"));
      return;
    }
    const timer = setTimeout(() => reject(new Error("Verovio toolkit timed out")), TOOLKIT_TIMEOUT_MS);
    window.verovio.module.onRuntimeInitialized = () => {
      clearTimeout(timer);
      const toolkit = new window.verovio.toolkit();
      toolkit.setOptions({
        neumeCalligraphic: true,
        adjustPageWidth: true,
        adjustPageHeight: true,
        breaks: "none",
        header: "none",
        footer: "none",
        pageMarginTop: 20,
        pageMarginBottom: 20,
        pageMarginLeft: 20,
        pageMarginRight: 20,
        lyricSize: 2.2,
        scale: 260,
      });
      resolve(toolkit);
    };
  });

const panel = document.getElementById("live-panel");

const useFallbackVideo = (reason) => {
  console.warn("live rendering unavailable:", reason.message);
  panel.classList.add("fallback-active");
  panel.querySelector("video")?.play().catch(() => {});
};

toolkitReady().then((toolkit) => {
  const elements = {
    panel,
    code: document.getElementById("live-mei"),
    input: document.getElementById("live-input"),
    render: document.getElementById("live-render"),
    restart: document.getElementById("live-restart"),
    name: document.getElementById("live-name"),
  };
  const live = new LiveNeume(toolkit, elements);

  elements.input.addEventListener("pointerdown", () => live.takeOver());
  elements.input.addEventListener("focus", () => live.takeOver());
  elements.input.addEventListener("input", () => live.onInput());
  elements.input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") live.restart();
  });
  elements.restart.addEventListener("click", () => live.restart());

  const slide = panel.closest("section");
  const update = () => (Reveal.getCurrentSlide() === slide ? live.play() : live.stop());
  Reveal.on("ready", update);
  Reveal.on("slidechanged", update);
  if (Reveal.isReady()) update();
}, useFallbackVideo);
})();
