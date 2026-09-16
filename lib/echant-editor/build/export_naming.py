"""Freeze the backend's neume-naming registry into JSON.

`derive_neume_name` reads the registry only through `neume_marks`,
`neume_visual_attrs`, `canonical_neume_type` and `_structural_marks_of`, and
always at the name's own contour length — so every lookup it can make is
precomputable. The embed's TypeScript port scores against this table.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, "/Users/nielspfeffer/Projects/neumes-playground/backend/src")

from echant.projection import mei  # noqa: E402

entries = []
for order, (name, contour) in enumerate(mei._INTM_CONTOURS.items()):
    n = len(contour)
    marks = mei.neume_marks(name, n)
    entries.append(
        {
            "name": name,
            "contour": list(contour),
            "base": mei.canonical_neume_type(name),
            "order": order,
            "structMarks": {str(i): m for i, m in mei._structural_marks_of(name, n).items()},
            "visual": [
                {k: v for k, v in attrs.items() if v is not None}
                for attrs in mei.neume_visual_attrs(name, n)
            ],
            "suffixes": sorted({m for m in marks if m in mei._SUFFIX_MARKS}),
        }
    )

table = {
    "entries": entries,
    "markWords": list(mei._MARK_WORDS),
    "structuralSpecials": sorted(mei._STRUCTURAL_SPECIALS),
    "suffixMarks": sorted(mei._SUFFIX_MARKS),
    "shapeDefiningVisual": sorted(mei._SHAPE_DEFINING_VISUAL),
    "visualAttrFields": sorted(mei.VISUAL_ATTR_FIELDS),
}

out = Path(__file__).resolve().parent / "data" / "neume-naming.json"
out.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")))
print(len(entries), "entries,", out.stat().st_size / 1024, "KiB")
