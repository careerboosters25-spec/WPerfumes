#!/usr/bin/env python3
import argparse
from app import create_app, db
from sqlalchemy import text

parser = argparse.ArgumentParser(description="Preview and optionally fix leading '/static/' in product.image_url and story.featured_image")
parser.add_argument("--apply", action="store_true", help="Apply changes")
args = parser.parse_args()

app = create_app()
with app.app_context():
    q = "SELECT id, image_url FROM product WHERE image_url LIKE '/static/%' ORDER BY id"
    rows = db.session.execute(text(q)).fetchall()
    print("Product rows with leading /static/:", len(rows))
    for r in rows[:50]:
        print(r.id, "->", r.image_url, "=>", r.image_url[8:])
    if len(rows) > 50:
        print("... and", len(rows)-50, "more")

    q2 = "SELECT id, featured_image FROM story WHERE featured_image LIKE '/static/%' ORDER BY id"
    rows2 = db.session.execute(text(q2)).fetchall()
    print("Story rows with leading /static/:", len(rows2))
    for r in rows2[:20]:
        print(r.id, "->", r.featured_image, "=>", r.featured_image[8:])

    if args.apply:
        print("Creating backups and applying updates...")
        db.session.execute(text("CREATE TABLE IF NOT EXISTS product_image_backup AS SELECT id, image_url FROM product WHERE image_url LIKE '/static/%'"))
        db.session.execute(text("CREATE TABLE IF NOT EXISTS story_image_backup AS SELECT id, featured_image FROM story WHERE featured_image LIKE '/static/%'"))
        db.session.execute(text("UPDATE product SET image_url = substr(image_url, 9) WHERE image_url LIKE '/static/%'"))
        db.session.execute(text("UPDATE story SET featured_image = substr(featured_image, 9) WHERE featured_image LIKE '/static/%'"))
        db.session.commit()
        print("Applied updates, backups created.")
    else:
        print("Preview only. Re-run with --apply to make changes (after verifying previews).")
