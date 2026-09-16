"""Generate derive-name cases + the backend's answers, for the port's diff test."""
import itertools, json, random, sys
from pathlib import Path
sys.path.insert(0, "/Users/nielspfeffer/Projects/neumes-playground/backend/src")
from echant.projection.mei import derive_neume_name, _INTM_CONTOURS
from echant.repositories.dto import NeumeComponentDraft, normalize_specials

SPECIALS = ["oriscus", "quilisma", "strophicus", "liquescent", "episema"]
TILTS = [None, "n", "ne", "e", "se", "s", "sw", "w", "nw"]
CONS = [None, "g", "l", "e"]
CURVES = [None, "a", "c"]
RELLENS = [None, "s", "l"]
SSHAPES = [None, "n", "i"]
BASES = [None, ""] + list(_INTM_CONTOURS) + ["pes_quadratus", "PES QUADRATUS", "virga-episema", "nonsense"]

rng = random.Random(20260916)

def rand_component(i):
    c = {
        "intm": None if i == 0 else rng.choice(["u", "s", "d", None]),
        "specials": normalize_specials(rng.sample(SPECIALS, rng.randint(0, 2))),
        "tilt": rng.choice(TILTS),
        "con": rng.choice(CONS),
        "curve": rng.choice(CURVES),
        "rellen": rng.choice(RELLENS),
        "s_shape": rng.choice(SSHAPES),
        "waves": rng.choice([None, 2, 3]),
        "hooked": rng.choice([None, True, False]),
        "angled": rng.choice([None, True, False]),
    }
    return c

cases = []
# Every registry shape, bare and with each suffix mark, against every base_type.
for name, contour in _INTM_CONTOURS.items():
    for extra in ([], ["liquescent"], ["episema"], ["liquescent", "episema"]):
        comps = [
            {"intm": None if i == 0 else m, "specials": normalize_specials(extra)}
            for i, m in enumerate(contour)
        ]
        cases.append({"components": comps, "base_type": name})
        cases.append({"components": comps, "base_type": None})
# Exhaustive small: 1- and 2-note, structural marks x tilt x angled.
for n in (1, 2):
    for contour in itertools.product(["u", "s", "d"], repeat=n - 1):
        for marks in itertools.product([[], ["oriscus"], ["quilisma"], ["strophicus"]], repeat=n):
            for tilt in TILTS:
                for angled in (None, True):
                    comps = [
                        {"intm": None if i == 0 else contour[i - 1], "specials": marks[i],
                         "tilt": tilt, "angled": angled}
                        for i in range(n)
                    ]
                    cases.append({"components": comps, "base_type": rng.choice(BASES)})
# Random fuzz over everything.
for _ in range(6000):
    n = rng.randint(0, 5)
    cases.append({"components": [rand_component(i) for i in range(n)],
                  "base_type": rng.choice(BASES)})

for case in cases:
    comps = [NeumeComponentDraft(**{k: v for k, v in c.items()}) for c in case["components"]]
    case["expected"] = derive_neume_name(comps, base_type=case["base_type"])

Path("data/derive-cases.json").write_text(json.dumps(cases, separators=(",", ":")))
print(len(cases), "cases")
