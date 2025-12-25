from app import create_app, db
from sqlalchemy import text
import os

app = create_app()
with app.app_context():
    rows = db.session.execute(text("SELECT id, image_url FROM product ORDER BY id")).fetchall()
    missing = []
    for r in rows:
        rel = (r.image_url or "").lstrip("/")
        full = os.path.join(app.static_folder, rel)
        if not os.path.exists(full):
            missing.append((r.id, rel))
    print("Searching for candidates for", len(missing), "missing images...")
    for pid, rel in missing:
        basename = os.path.basename(rel)
        candidates = []
        # search from repo root ('.')
        for root, dirs, files in os.walk("."):
            if basename in files:
                candidates.append(os.path.join(root, basename))
                if len(candidates) >= 5:
                    break
        print(pid, "->", rel, "  candidates:", candidates[:5])
