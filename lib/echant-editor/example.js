/* „Dif-fu-sa est" typed into an empty chant, then handed over to whoever clicks
   into it. This is the shape a slide driver can take; nothing here reaches past
   the handle `mount` returns. */

const PACE_MS = 550;
const READ_MS = 2200;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slot = document.getElementById('slot');
const caption = document.getElementById('script');

const demo = EChantDemo.mount(slot, {
  start: 'blank',
  onReady: () => restart(),
  onActiveChange: (active) => {
    caption.innerHTML = active
      ? 'Der Editor hat die Tastatur. <b>*</b> beginnt eine Neume, <b>u / s / d</b> setzen die Bewegung, <b>Leertaste</b> schließt sie ab, <b>Escape</b> gibt die Tastatur zurück.'
      : 'Vorführung läuft — hineinklicken zum Selbstprobieren.';
  },
});

const label = (step) => {
  if (step.kind === 'key') return { ' ': 'Leertaste' }[step.key] ?? step.key;
  if (step.kind === 'littera') return `Littera ${step.letter}`;
  return `${step.field} = ${step.value}`;
};

async function play(generation) {
  const running = () => generation === play.generation && !demo.isActive();

  while (running()) {
    await demo.reset({ blank: true });
    if (!running()) return;
    await demo.selectSyllable(0);
    await wait(PACE_MS);

    for (const syllable of EChantDemo.firstPhrase) {
      for (const step of syllable.steps) {
        if (!running()) return;
        if (step.kind === 'key') demo.key(step.key);
        else if (step.kind === 'inspector') demo.clickInspector(step.field, step.value);
        else await demo.setLittera(step.place, step.letter);
        caption.innerHTML = `„${syllable.syllable}“ &middot; <b>${label(step)}</b>`;
        await wait(PACE_MS);
      }
    }

    if (!running()) return;
    const written = demo.encoding().map((neume) => neume.name).join(', ');
    caption.innerHTML = `Eingegeben: <b>${written}</b>`;
    await wait(READ_MS * 2);
  }
}

play.generation = 0;
function restart() {
  play(++play.generation);
}
