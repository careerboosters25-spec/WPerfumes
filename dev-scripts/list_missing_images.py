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
    print("Total products:", len(rows))
    print("Missing files:", len(missing))
    for m in missing[:80]:
        print(m[0], "->", m[1])
