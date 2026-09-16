/* Slide 2: the adiastematic Verovio fork renders MEI live, first typed by the deck,
   then editable by whoever clicks into the pane. */

const CHAR_MS = 26;
const DELETE_MS = 9;
const HOLD_MS = 2000;
const LOOP_PAUSE_MS = 2600;
const TOOLKIT_TIMEOUT_MS = 8000;

const STATES = [
  `<syllable>
  <syl>Virga</syl>
  <neume>
    <nc tilt="ne"/>
  </neume>
</syllable>`,
  `<syllable>
  <syl>Clivis</syl>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
  </neume>
</syllable>`,
  `<syllable>
  <syl>Porrectus</syl>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
    <nc tilt="ne" intm="u"/>
  </neume>
</syllable>`,
  `<syllable>
  <syl>Porrectus liquescens</syl>
  <neume>
    <nc tilt="ne" curve="c"/>
    <nc tilt="s" intm="d"/>
    <nc tilt="ne" intm="u">
      <liquescent curve="a"/>
    </nc>
  </neume>
</syllable>`,
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

class LiveNeume {
  constructor(toolkit, elements) {
    this.toolkit = toolkit;
    this.elements = elements;
    this.text = "";
    this.generation = 0;
    this.edited = false;
  }

  show({ caret = true } = {}) {
    this.elements.code.innerHTML = highlight(this.text) + (caret ? '<span class="caret"></span>' : "");
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

  async write(target, generation) {
    const keep = commonPrefix(this.text, target);
    while (this.text.length > keep && this.generation === generation) {
      this.text = this.text.slice(0, -1);
      this.show();
      this.render();
      await wait(DELETE_MS);
    }
    while (this.text.length < target.length && this.generation === generation) {
      this.text = target.slice(0, this.text.length + 1);
      this.show();
      this.render();
      await wait(CHAR_MS);
    }
  }

  async play() {
    if (this.edited) return;
    const generation = ++this.generation;
    while (this.generation === generation) {
      for (const state of STATES) {
        await this.write(state, generation);
        if (this.generation !== generation) return;
        await wait(HOLD_MS);
      }
      await wait(LOOP_PAUSE_MS);
      if (this.generation !== generation) return;
      this.text = "";
      this.show();
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
    this.show({ caret: false });
  }

  onInput() {
    this.text = this.elements.input.value;
    this.show({ caret: false });
    this.render();
  }

  restart() {
    this.edited = false;
    this.elements.panel.classList.remove("editing", "invalid");
    this.elements.input.blur();
    this.text = "";
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
