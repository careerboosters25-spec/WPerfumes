#!/usr/bin/env python3
"""
Local runner: connect to DB via your env DATABASE_URL and:
 - backup product/story rows that start with '/static/' into product_image_backup/story_image_backup
 - remove leading '/static/' from product.image_url and story.featured_image
 - ensure setting 'checkout_discount' exists (insert '0' if missing)
 - print previews and final counts
"""
from app import create_app, db
from app.models import Setting
from sqlalchemy import text
import os, traceback

app = create_app()
with app.app_context():
    try:
        dsn = os.environ.get("DATABASE_URL") or "<no DATABASE_URL>"
        masked = (dsn[:30] + "...") if len(dsn) > 40 else dsn
        print("Using DATABASE_URL (masked):", masked)
    except Exception:
        print("Could not read DATABASE_URL")

    try:
        cnt_products = db.session.execute(text("SELECT count(*) FROM product WHERE image_url LIKE '/static/%'")).scalar()
        cnt_stories = db.session.execute(text("SELECT count(*) FROM story WHERE featured_image LIKE '/static/%'")).scalar()
        print(f"Found {cnt_products} product rows and {cnt_stories} story rows with leading '/static/'")

        if cnt_products or cnt_stories:
            print("Creating backup tables (if not exists)...")
            db.session.execute(text("CREATE TABLE IF NOT EXISTS product_image_backup AS SELECT id, image_url FROM product WHERE image_url LIKE '/static/%'"))
            db.session.execute(text("CREATE TABLE IF NOT EXISTS story_image_backup AS SELECT id, featured_image FROM story WHERE featured_image LIKE '/static/%'"))
            db.session.commit()
            print("Backups created.")

            preview_p = db.session.execute(text("SELECT id, image_url, substr(image_url,9) AS new_path FROM product WHERE image_url LIKE '/static/%' ORDER BY id LIMIT 10")).fetchall()
            if preview_p:
                print("Preview product updates (id | old -> new):")
                for r in preview_p:
                    print(r[0], "|", r[1], "=>", r[2])

            print("Applying updates to remove leading '/static/' ...")
            db.session.execute(text("UPDATE product SET image_url = substr(image_url, 9) WHERE image_url LIKE '/static/%'"))
            db.session.execute(text("UPDATE story SET featured_image = substr(featured_image, 9) WHERE featured_image LIKE '/static/%'"))
            db.session.commit()
            print("Update applied.")
        else:
            print("No rows needed updating.")

    except Exception as e:
        print("Error during image_url fix:")
        traceback.print_exc()

    try:
        print("Checking 'checkout_discount' setting...")
        s = Setting.query.get("checkout_discount")
        if s:
            print("checkout_discount found ->", s.value)
        else:
            print("checkout_discount not found -> inserting default 0")
            s_new = Setting(key="checkout_discount", value=str(0))
            db.session.add(s_new)
            db.session.commit()
            print("Inserted checkout_discount = 0")
    except Exception as e:
        print("Error checking/inserting setting 'checkout_discount':")
        traceback.print_exc()

    try:
        prod_after = db.session.execute(text("SELECT count(*) FROM product WHERE image_url LIKE '/static/%'")).scalar()
        story_after = db.session.execute(text("SELECT count(*) FROM story WHERE featured_image LIKE '/static/%'")).scalar()
        print("After update: product rows with leading /static/:", prod_after)
        print("After update: story rows with leading /static/:", story_after)
        print("\nSample product rows (id, image_url) after update (10):")
        rows = db.session.execute(text("SELECT id, image_url FROM product ORDER BY id LIMIT 10")).fetchall()
        for r in rows:
            print(r[0], "|", r[1])
        print("\nSample settings (checkout_discount):")
        try:
            rows = db.session.execute(text("SELECT key, value FROM setting WHERE key='checkout_discount'")).fetchall()
            for row in rows:
                print(row[0], "|", row[1])
        except Exception as ex:
            print("Could not query setting table:", ex)
    except Exception:
        traceback.print_exc()
    print("Finished.")
