"""Dump the demo chant's API payloads from a copy of the local eChant DB.

Calls the backend's own service layer, so the JSON is byte-for-byte what the
SPA gets from GET /chants/{id}, GET /chants/{id}/document?images=0 and
GET /pages/{id}/document. Page images are omitted; the embed ships its own.
"""

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = Path("/Users/nielspfeffer/Projects/neumes-playground/backend")

os.environ["ECHANT_DB_PATH"] = str(HERE / "data" / "echant-copy.db")
sys.path.insert(0, str(BACKEND / "src"))

from sqlalchemy.orm import Session  # noqa: E402

from echant.db.base import get_engine  # noqa: E402
from echant.repositories import chants as chants_repo  # noqa: E402
from echant.repositories import pages as pages_repo  # noqa: E402
from echant.services import chant_document as chant_document_service  # noqa: E402
from echant.services import chants as chants_service  # noqa: E402
from echant.services import pages as pages_service  # noqa: E402

CHANT_ID = "def918df-96d6-4fef-9c12-c2eaefc7db90"
PAGE_ID = "9bfb92bf-9d42-404e-8113-cba881bb8a5e"

no_image = lambda page: None  # noqa: E731

with Session(get_engine()) as session:
    chant = chants_repo.get(session, CHANT_ID)
    page = pages_repo.get_loaded(session, PAGE_ID)
    out = {
        "chant": chants_service.chant_detail_dict(session, chant),
        "chantDocument": chant_document_service.chant_document_dict(
            session, chant, image_loader=no_image, include_images=False
        ),
        "pageDocument": pages_service.page_document_dict(page, image_loader=no_image),
    }

(HERE / "data" / "payloads.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print("chant syllables:", len(out["chant"]["syllables"]))
print("doc lines:", len(out["chantDocument"]["lines"]),
      "neumes:", len(out["chantDocument"]["neumes"]),
      "pages:", [p["folio_label"] for p in out["chantDocument"]["pages"]])
print("page image:", out["pageDocument"]["image"]["width"], "x", out["pageDocument"]["image"]["height"])
print("page lines:", len(out["pageDocument"]["lines"]), "neumes:", len(out["pageDocument"]["neumes"]))
