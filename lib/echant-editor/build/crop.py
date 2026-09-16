"""Crop the folio to the chant's neighbourhood, downscale it, and rebase the
demo payloads onto the crop.

Every polygon and bbox in the chant document is in full-page pixels; the canvas
normalizes them against image.width/height. Translating both by the same crop
origin and scale keeps the two consistent, so the embed ships a small image and
still lines its zones up.
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
CROP = (330, 2620, 2720, 3980)  # left, top, right, bottom in full-page pixels
TARGET_WIDTH = 1400
QUALITY = 78

src = Image.open(HERE / "data" / "page-75-full.jpg")
region = src.crop(CROP)
scale = TARGET_WIDTH / region.width
out = region.resize((TARGET_WIDTH, round(region.height * scale)), Image.LANCZOS)
out.save(HERE.parent / "facsimile.jpg", "JPEG", quality=QUALITY, optimize=True, progressive=True)

left, top = CROP[0], CROP[1]
put = lambda v, origin: round((v - origin) * scale)  # noqa: E731


def rebase_polygon(points):
    return [[put(x, left), put(y, top)] for x, y in points]


def rebase_bbox(bbox):
    x, y = put(bbox["x"], left), put(bbox["y"], top)
    return {
        "x": x,
        "y": y,
        "width": put(bbox["x"] + bbox["width"], left) - x,
        "height": put(bbox["y"] + bbox["height"], top) - y,
    }


payloads = json.loads((HERE / "data" / "payloads.json").read_text())

for doc in (payloads["chantDocument"], payloads["pageDocument"]):
    for line in doc["lines"]:
        line["boundary"] = rebase_polygon(line["boundary"])
        for syllable in line["syllables"]:
            syllable["boundary"] = rebase_polygon(syllable["boundary"])
    for neume in doc["neumes"]:
        neume["bbox"] = rebase_bbox(neume["bbox"])
        for letter in neume.get("signif_letters") or []:
            letter["bbox"] = rebase_bbox(letter["bbox"])
    for clef in doc["clefs"]:
        if clef.get("boundary"):
            clef["boundary"] = rebase_polygon(clef["boundary"])

image = payloads["pageDocument"]["image"]
image["width"], image["height"] = out.width, out.height
image["filename"] = "facsimile.jpg"

for page in payloads["chantDocument"]["pages"]:
    page["image"] = {"filename": "facsimile.jpg", "width": out.width, "height": out.height, "data_url": ""}

(HERE / "data" / "payloads-cropped.json").write_text(json.dumps(payloads, ensure_ascii=False, separators=(",", ":")))

size = (HERE.parent / "facsimile.jpg").stat().st_size
print(f"crop {region.width}x{region.height} -> {out.width}x{out.height}, {size / 1024:.0f} KiB")
print("payload", (HERE / "data" / "payloads-cropped.json").stat().st_size / 1024, "KiB")
