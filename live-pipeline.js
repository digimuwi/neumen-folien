/* Slide 4: the recognition stages as a live tab strip. The deck cycles them; a click
   on a tab stops the cycle and hands the strip to whoever wants to look for themselves. */

(() => {
const DEFAULT_HOLD_S = 3.5;

const panel = document.getElementById("pipeline-panel");
const tabList = document.getElementById("pipeline-tabs");
const image = document.getElementById("pipeline-image");
const caption = document.getElementById("pipeline-caption");

const useFallbackVideo = (reason) => {
  console.warn("pipeline panels unavailable:", reason.message);
  panel.classList.add("fallback-active");
  panel.querySelector("video")?.play().catch(() => {});
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class PanelStrip {
  constructor(panels) {
    this.panels = panels;
    this.index = 0;
    this.generation = 0;
    this.held = false;
    this.tabs = panels.map((entry, index) => this.buildTab(entry, index));
    this.tabs.forEach((tab) => tabList.append(tab));
    panels.forEach((entry) => {
      const preload = new Image();
      preload.src = `assets/pipeline/panels/${entry.file}`;
    });
    this.show(0);
  }

  buildTab(entry, index) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "panel-tab";
    tab.textContent = entry.label;
    tab.setAttribute("role", "tab");
    tab.addEventListener("click", () => {
      this.held = true;
      this.stop();
      this.show(index);
      panel.classList.add("held");
    });
    return tab;
  }

  show(index) {
    this.index = index;
    const entry = this.panels[index];
    image.src = `assets/pipeline/panels/${entry.file}`;
    image.alt = entry.label;
    caption.textContent = entry.caption ?? "";
    this.tabs.forEach((tab, i) => tab.classList.toggle("current", i === index));
  }

  async play() {
    if (this.held) return;
    const generation = ++this.generation;
    while (generation === this.generation) {
      const entry = this.panels[this.index];
      await wait((entry.hold ?? DEFAULT_HOLD_S) * 1000);
      if (generation !== this.generation) return;
      this.show((this.index + 1) % this.panels.length);
    }
  }

  stop() {
    this.generation += 1;
  }

  resume() {
    this.held = false;
    panel.classList.remove("held");
    this.play();
  }
}

const panels = window.PIPELINE_PANELS;

if (!Array.isArray(panels) || !panels.length) {
  useFallbackVideo(new Error("no panels defined"));
} else {
  const strip = new PanelStrip(panels);
  const slide = panel.closest("section");
  const update = () => (Reveal.getCurrentSlide() === slide ? strip.play() : strip.stop());
  Reveal.on("ready", update);
  Reveal.on("slidechanged", update);
  if (Reveal.isReady()) update();

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") strip.resume();
  });
}
})();
