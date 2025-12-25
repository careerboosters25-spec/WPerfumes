from app import create_app, db
from sqlalchemy import text
import os

app = create_app()
with app.app_context():
    rows = db.session.execute(text("SELECT id, image_url FROM product ORDER BY id LIMIT 50")).fetchall()
    print("app.static_folder:", app.static_folder)
    for r in rows:
        pid = r.id
        rel = (r.image_url or "").lstrip("/")
        full = os.path.join(app.static_folder, rel)
        print(pid, "|", r.image_url, "| exists:", os.path.exists(full), "|", full)
