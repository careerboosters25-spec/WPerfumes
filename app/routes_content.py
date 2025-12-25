# app/routes_content.py
from flask import Blueprint, request, jsonify, current_app, render_template, session
from . import db
from .models import Story
from werkzeug.utils import secure_filename
import os
from datetime import datetime

content_bp = Blueprint("content_bp", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def _is_admin_session():
    return session.get("user") in ("admin", "admin@example.com")


def _ensure_upload_dir():
    upload_dir = os.path.join(current_app.static_folder, "uploads", "content")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def _allowed_file(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in ALLOWED_IMAGE_EXTENSIONS


# --------------------
# Public content API
# --------------------
@content_bp.route("/pages/<slug>", methods=["GET"])
def get_page_by_slug(slug):
    s = Story.query.filter_by(slug=slug, published=True).first()
    if s:
        return jsonify(s.to_public_dict())
    s2 = Story.query.filter_by(section=slug, published=True) \
        .order_by(Story.position.desc(), Story.published_at.desc().nullslast(), Story.created_at.desc()) \
        .first()
    if s2:
        return jsonify(s2.to_public_dict())
    return jsonify({"error": "Not found"}), 404


@content_bp.route("/stories", methods=["GET"])
def list_stories():
    """
    Public list of published stories.
    Query params: section, limit, page
    Ordered by position desc (manual prominence), then published_at desc.
    """
    section = request.args.get("section")
    try:
        limit = int(request.args.get("limit", 20))
    except Exception:
        limit = 20
    try:
        page = int(request.args.get("page", 1))
    except Exception:
        page = 1

    q = Story.query.filter_by(published=True)
    if section:
        q = q.filter_by(section=section)
    total = q.count()
    q = q.order_by(Story.position.desc(), Story.published_at.desc(
    ).nullslast(), Story.created_at.desc())
    items = q.limit(limit).offset((page - 1) * limit).all()
    return jsonify({
        "items": [s.to_public_dict() for s in items],
        "total": total,
        "page": page,
        "limit": limit
    })


@content_bp.route("/stories/<slug>", methods=["GET"])
def story_detail(slug):
    s = Story.query.filter_by(slug=slug, published=True).first()
    if not s:
        return jsonify({"error": "Not found"}), 404
    return jsonify(s.to_public_dict())


# --------------------
# Admin API (session-based) + search/paging
# --------------------
@content_bp.route("/admin/stories", methods=["GET"])
def admin_list_stories():
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    # support search query `q`, pagination page/limit, and optional section filter
    qtext = request.args.get("q", "").strip()
    section = request.args.get("section", "").strip() or None
    try:
        limit = int(request.args.get("limit", 40))
    except Exception:
        limit = 40
    try:
        page = int(request.args.get("page", 1))
    except Exception:
        page = 1

    q = Story.query
    if section:
        q = q.filter(Story.section == section)
    if qtext:
        like = f"%{qtext}%"
        q = q.filter((Story.title.ilike(like)) | (
            Story.slug.ilike(like)) | (Story.excerpt.ilike(like)))
    total = q.count()
    q = q.order_by(Story.position.desc(), Story.created_at.desc())
    items = q.limit(limit).offset((page - 1) * limit).all()
    return jsonify({
        "items": [{
            "id": s.id,
            "title": s.title,
            "slug": s.slug,
            "section": s.section,
            "excerpt": s.excerpt,
            "published": s.published,
            "published_at": s.published_at.isoformat() if s.published_at else None,
            "position": s.position,
            # include editable fields so the admin UI can load body/author/featured_image
            "body_html": s.body_html,
            "author": s.author,
            "featured_image": s.featured_image
        } for s in items],
        "total": total,
        "page": page,
        "limit": limit
    })


@content_bp.route("/admin/stories", methods=["POST"])
def admin_create_story():
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    slug = (data.get("slug") or "").strip()
    section = (data.get("section") or "").strip() or None
    if not title:
        return jsonify({"error": "title required"}), 400
    if not slug:
        return jsonify({"error": "slug required"}), 400
    body = data.get("body_html", "")
    excerpt = data.get("excerpt", "")
    author = data.get("author", "")
    featured_image = data.get("featured_image", None)
    published = bool(str(data.get("published", False)).lower()
                     in ("1", "true", "yes", "on"))
    published_at = datetime.utcnow() if published else None

    exists = Story.query.filter_by(slug=slug).first()
    if exists:
        return jsonify({"error": "slug already exists"}), 400

    # position: if provided else default 0
    pos = int(data.get("position", 0)) if data.get(
        "position") is not None else 0

    s = Story(
        title=title,
        slug=slug,
        section=section,
        excerpt=excerpt,
        body_html=body,
        author=author,
        featured_image=featured_image,
        published=published,
        published_at=published_at,
        position=pos
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({"success": True, "id": s.id}), 201


@content_bp.route("/admin/stories/<int:story_id>", methods=["PUT"])
def admin_update_story(story_id):
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    s = Story.query.filter_by(id=story_id).first()
    if not s:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    s.title = data.get("title", s.title)
    new_slug = data.get("slug", s.slug)
    if new_slug != s.slug:
        if Story.query.filter(Story.slug == new_slug, Story.id != s.id).first():
            return jsonify({"error": "slug already in use"}), 400
        s.slug = new_slug
    s.section = (data.get("section") or s.section)
    s.excerpt = data.get("excerpt", s.excerpt)
    s.body_html = data.get("body_html", s.body_html)
    s.author = data.get("author", s.author)
    s.featured_image = data.get("featured_image", s.featured_image)
    new_published = bool(
        str(data.get("published", s.published)).lower() in ("1", "true", "yes", "on"))
    if new_published and not s.published:
        s.published_at = datetime.utcnow()
    if not new_published:
        s.published_at = None
    s.published = new_published
    # allow updating position from admin update
    if "position" in data:
        try:
            s.position = int(data.get("position", s.position))
        except Exception:
            pass
    db.session.commit()
    return jsonify({"success": True})


@content_bp.route("/admin/stories/<int:story_id>", methods=["DELETE"])
def admin_delete_story(story_id):
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    s = Story.query.filter_by(id=story_id).first()
    if not s:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({"success": True})


@content_bp.route("/admin/stories/<int:story_id>/publish", methods=["POST"])
def admin_publish_toggle(story_id):
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    s = Story.query.filter_by(id=story_id).first()
    if not s:
        return jsonify({"error": "Not found"}), 404
    action = (request.get_json(silent=True) or {}).get("action", "publish")
    if action == "publish":
        s.published = True
        s.published_at = datetime.utcnow()
    else:
        s.published = False
        s.published_at = None
    db.session.commit()
    return jsonify({"success": True, "published": s.published})


@content_bp.route("/admin/stories/reorder", methods=["POST"])
def admin_reorder_stories():
    """
    Accepts JSON: { "ids": [3, 7, 1, 2] } where the first id in the list should get highest position.
    Sets position descending so queries ordered by position show the same order.
    """
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    if not isinstance(ids, list):
        return jsonify({"error": "Invalid payload, expected ids list"}), 400
    # assign positions starting from len(ids) down to 1
    pos = len(ids)
    for sid in ids:
        try:
            s = Story.query.filter_by(id=int(sid)).first()
            if s:
                s.position = pos
                pos -= 1
        except Exception:
            continue
    db.session.commit()
    return jsonify({"success": True})


@content_bp.route("/admin/upload-image", methods=["POST"])
def admin_upload_image():
    if not _is_admin_session():
        return jsonify({"error": "Unauthorized"}), 401
    if "image" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    if not _allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    upload_dir = _ensure_upload_dir()
    filename = secure_filename(file.filename)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    filename = f"{timestamp}_{filename}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)
    rel_path = f"uploads/content/{filename}"
    url = f"/static/{rel_path}"
    return jsonify({"url": url, "path": rel_path}), 201


@content_bp.route("/admin", methods=["GET"])
def content_admin_ui():
    if not _is_admin_session():
        return render_template("content_admin.html", signin_required=True)
    return render_template("content_admin.html", signin_required=False)
