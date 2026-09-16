"""Freeze what the neume-class seed supplies, so the embed can tell a hand
annotation from a materialised default.

`backend/neume_visual_attrs.yaml` gives every class a per-note set of visual
attributes, and the class NAME implies per-note marks. A backfill wrote both onto
the stored components, so the corpus now carries values no annotator typed — the
`@angled` on this chant's `pes quadratus`, say, which the published MEI in
`echant-data` does not have. Comparing a stored value against the seed for its
class is what separates the two.

Keyed by `"<type_key>|<n>"` because the seed is a pure function of the class and
the note count; only the pairs this chant actually uses are emitted.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, "/Users/nielspfeffer/Projects/neumes-playground/backend/src")

from echant.projection.mei import neume_marks, neume_visual_attrs  # noqa: E402

HERE = Path(__file__).resolve().parent
document = json.loads((HERE / "data" / "payloads-cropped.json").read_text())["chantDocument"]

seeds = {}
for neume in document["neumes"]:
    n = len(neume["components"])
    key = f"{neume['type_key']}|{n}"
    if key in seeds:
        continue
    seeds[key] = {
        "visual": [{k: v for k, v in attrs.items() if v is not None} for attrs in neume_visual_attrs(neume["type_key"], n)],
        "marks": neume_marks(neume["type_key"], n),
    }

out = HERE / "data" / "neume-seeds.json"
out.write_text(json.dumps(seeds, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
print(len(seeds), "class/length pairs,", out.stat().st_size, "bytes")
for key in sorted(seeds)[:6]:
    print(" ", key, seeds[key])
