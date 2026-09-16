"""Record what a person actually encoded, from the published corpus.

The stored components carry more than anyone typed. Some of it is the class seed
(`backend/neume_visual_attrs.yaml`) materialised by a backfill; some of it — this
chant's `@tilt` on a `bivirga`, say — matches neither the current seed nor the
published MEI, so it comes from an older seed or an earlier backfill. Either way
it is not a hand annotation.

`echant-data` is the authority for that question: it is the corpus as published,
and for this chant it encodes each neume as a contour plus the marks and
significative letters the annotator set, with no visual attributes at all. Neumes
are matched to the database by their facsimile zone, whose id spells out the
bbox, so the match is exact rather than positional.

Run after `extract.py` and before `crop.py`: it reads the un-rebased bboxes.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

MEI = Path(
    "/Users/nielspfeffer/Projects/echant-data/manuscripts"
    "/st-gallen-stiftsbibliothek-cod-sang-338/chants"
    "/def918df-96d6-4fef-9c12-c2eaefc7db90.mei"
)
NS = {"m": "http://www.music-encoding.org/ns/mei"}
MARKS = {"episema", "liquescent", "oriscus", "quilisma", "strophicus"}
VISUAL = {"curve", "con", "rellen", "s-shape", "waves", "hooked", "angled", "tilt"}

HERE = Path(__file__).resolve().parent
payloads = json.loads((HERE / "data" / "payloads.json").read_text())
document = payloads["chantDocument"]

local = lambda tag: tag.split("}")[-1]  # noqa: E731


def neume_record(neume) -> dict:
    """The marks, letters and attributes this neume carries in the MEI."""
    ncs = neume.findall("m:nc", NS)
    return {
        "contour": [nc.get("intm") for nc in ncs],
        "marks": [sorted(local(child.tag) for child in nc if local(child.tag) in MARKS) for nc in ncs],
        "attrs": [{local(k): v for k, v in nc.attrib.items() if local(k) in VISUAL} for nc in ncs],
        "litterae": [
            {"letter": (sl.text or "").strip(), "place": sl.get("place")}
            for sl in neume.findall("m:signifLet", NS)
        ],
    }


by_zone = {}
for neume in ET.parse(MEI).getroot().iter(f"{{{NS['m']}}}neume"):
    facs = (neume.get("facs") or "").lstrip("#")
    if facs.startswith("zone-n-"):
        by_zone[facs[len("zone-n-"):]] = neume_record(neume)

authored = {}
unmatched = []
for neume in document["neumes"]:
    box = neume["bbox"]
    key = f"{box['x']}-{box['y']}-{box['width']}-{box['height']}"
    record = by_zone.get(key)
    if record is None:
        unmatched.append((neume["id"], neume["type_key"], key))
        continue
    stored_contour = [c["intm"] for c in neume["components"]]
    authored[neume["id"]] = {
        **record,
        # The two stores disagree about a few neumes' note counts. Where they do,
        # the marks cannot be matched up note by note, so only the letters stand.
        "contourMatches": stored_contour == record["contour"],
    }

out = HERE / "data" / "authored.json"
out.write_text(json.dumps(authored, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
print(f"{len(authored)}/{len(document['neumes'])} neumes matched to the published MEI, {out.stat().st_size} bytes")
mismatched = [n for n, r in authored.items() if not r["contourMatches"]]
print(f"  contour differs on {len(mismatched)} of them")
if unmatched:
    print(f"  no MEI zone for {len(unmatched)}: {unmatched[:3]}")
    sys.exit(0)
