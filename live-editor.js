/* Slide 3: the eChant editor itself, embedded. From an empty folio the script enters
   the opening phrase of „Diffusa est", showing every keystroke, until someone clicks in. */

(() => {
const STEP_MS = 620;
const SYLLABLE_MS = 700;
const READ_MS = 2600;
const LOOP_PAUSE_MS = 2400;
const CAP_MS = 900;
const READY_TIMEOUT_MS = 20000;
const AUTHORED_FIELDS = new Set(["Marks"]);
const SEEDED_MS = 130;

const KEY_LABELS = {
  " ": "Leertaste",
  "*": "✳",
  Escape: "Esc",
  Backspace: "⌫",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const IDLE_CAPTION = "Vorführung läuft, zum Selbstprobieren hineinklicken.";
const ACTIVE_CAPTION =
  "Der Editor hat die Tastatur: ✳ beginnt eine Neume, u, s und d setzen die Bewegung, Esc gibt sie zurück.";
const INTRO_CAPTION = "Aus dem leeren Folio: „Diffusa est“ Silbe für Silbe eingeben.";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class KeyCap {
  constructor(element) {
    this.element = element;
    this.timer = 0;
  }

  show(text, { action = false } = {}) {
    this.element.textContent = text;
    this.element.classList.toggle("action", action);
    this.element.classList.add("on");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.element.classList.remove("on"), CAP_MS);
  }
}

const panel = document.getElementById("editor-panel");
const stage = document.getElementById("editor-stage");
const caption = document.getElementById("editor-caption");
const keyCap = new KeyCap(document.getElementById("editor-keys"));

const useFallbackVideo = (reason) => {
  console.warn("embedded editor unavailable:", reason.message);
  panel.classList.add("fallback-active");
  panel.querySelector("video")?.play().catch(() => {});
};

/* The scripted run. It stops as soon as the editor is handed over or the slide is left. */
class EditorDemo {
  constructor(handle, phrase) {
    this.handle = handle;
    this.phrase = phrase;
    this.generation = 0;
  }

  running(generation) {
    return generation === this.generation && !this.handle.isActive();
  }

  say(text) {
    if (this.handle.isActive()) return;
    caption.textContent = text;
  }

  /* The corpus encodes only the contour and the real annotations: an episema, a
     strophicus, a littera. Tilt, angled and the like come from the neume class, so
     the demo does not type them either. */
  authored(steps) {
    return steps.filter(
      (step) => step.kind !== "inspector" || AUTHORED_FIELDS.has(step.field)
    );
  }

  async perform(step) {
    if (step.kind === "key") {
      keyCap.show(KEY_LABELS[step.key] ?? step.key);
      this.handle.key(step.key);
      await wait(STEP_MS);
      return;
    }
    if (step.kind === "littera") {
      keyCap.show(`Littera: ${step.letter}`, { action: true });
      await this.handle.setLittera(step.place ?? step.placement, step.letter);
      await wait(STEP_MS);
      return;
    }
    /* Tilt, angled and the like are not typed by anyone: the neume class carries
       them. They are still set, so the neume looks like the manuscript, but they
       pass without a key cap and at a pace that reads as the system's doing. */
    const authored = AUTHORED_FIELDS.has(step.field);
    if (authored) keyCap.show(`${step.field}: ${step.value}`, { action: true });
    else this.say("Form und Neigung kommen aus der Neumenklasse");
    await this.handle.clickInspector(step.field, step.value);
    await wait(authored ? STEP_MS : SEEDED_MS);
  }

  async enterSyllable(generation, entry) {
    this.say(`Silbe „${entry.syllable}“`);
    await wait(SYLLABLE_MS);
    for (const step of entry.steps) {
      if (!this.running(generation)) return false;
      await this.perform(step);
    }
    const written = this.handle.encoding().at(-1);
    if (written?.name) this.say(`„${entry.syllable}“ steht: ${written.name}`);
    await wait(SYLLABLE_MS);
    return this.running(generation);
  }

  async startBlank() {
    await this.handle.reset({ blank: true });
    await this.handle.selectSyllable(0);
  }

  async play() {
    const generation = ++this.generation;
    while (this.running(generation)) {
      this.say(INTRO_CAPTION);
      await this.startBlank();
      await wait(SYLLABLE_MS);
      for (const entry of this.phrase) {
        if (!(await this.enterSyllable(generation, entry))) return;
      }
      this.say(IDLE_CAPTION);
      await wait(READ_MS + LOOP_PAUSE_MS);
    }
  }

  stop() {
    this.generation += 1;
  }
}

if (!window.EChantDemo) {
  useFallbackVideo(new Error("EChantDemo not loaded"));
} else {
  let demo;
  const readyTimer = setTimeout(
    () => useFallbackVideo(new Error("editor did not become ready")),
    READY_TIMEOUT_MS
  );

  const handle = EChantDemo.mount(stage, {
    facsimileWidth: "34%",
    hints: false,
    start: "blank",
    onReady: () => {
      clearTimeout(readyTimer);
      const phrase = EChantDemo.firstPhrase ?? EChantDemo.entrySequence?.slice(0, 4) ?? [];
      if (!phrase.length) {
        useFallbackVideo(new Error("no entry sequence"));
        return;
      }
      demo = new EditorDemo(handle, phrase);

      /* Leaving mid-script would leave that edit in the chant, so it starts over clean. */
      const update = () => {
        const onSlide = Reveal.getCurrentSlide() === panel.closest("section");
        if (onSlide && !handle.isActive()) {
          demo.play();
          return;
        }
        demo.stop();
      };
      Reveal.on("slidechanged", update);
      update();
    },
    onActiveChange: (active) => {
      panel.classList.toggle("editing", active);
      caption.textContent = active ? ACTIVE_CAPTION : IDLE_CAPTION;
      if (active) demo?.stop();
      else demo?.play();
    },
  });

  /* Whoever has the keyboard, the key is shown. */
  stage.addEventListener("keydown", (event) => keyCap.show(KEY_LABELS[event.key] ?? event.key), true);
}
})();
