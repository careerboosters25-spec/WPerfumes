# New blueprint: simple DB-backed search endpoint
# Add to your create_app import/registration or register this blueprint in __init__.py
from flask import Blueprint, request, jsonify, current_app
from . import db
from .models import Product
from sqlalchemy import or_

search_bp = Blueprint("search_bp", __name__)


def to_static_url(path):
    if not path:
        return "/static/images/placeholder.jpg"
    if isinstance(path, str) and (path.startswith("http://") or path.startswith("https://") or path.startswith("/")):
        return path
    return "/static/" + path.lstrip("/")


@search_bp.route("/api/search", methods=["GET"])
def api_search():
    """
    GET /api/search?q=...&limit=20&page=1
    Returns JSON:
    {
      "items": [ <product objects> ],
      "total": <total_matches>,
      "page": <page>,
      "limit": <limit>
    }
    Matching fields (case-insensitive): title, brand, id, description, tags, keyNotes
    """
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"error": "q parameter required"}), 400
    try:
        limit = int(request.args.get("limit", 20))
    except Exception:
        limit = 20
    try:
        page = int(request.args.get("page", 1))
    except Exception:
        page = 1
    like = f"%{q}%"
    try:
        qry = Product.query.filter(or_(
            Product.title.ilike(like),
            Product.brand.ilike(like),
            Product.id.ilike(like),
            Product.description.ilike(like),
            Product.tags.ilike(like),
            Product.keyNotes.ilike(like)
        ))
        total = qry.count()
        items = qry.order_by(Product.title.asc()).limit(
            limit).offset((page - 1) * limit).all()
        out = []
        for p in items:
            out.append({
                "id": p.id,
                "brand": p.brand,
                "title": p.title,
                "price": p.price,
                "description": p.description,
                "keyNotes": p.keyNotes.split(";") if p.keyNotes else [],
                "image_url": to_static_url(p.image_url or p.image_url_dynamic),
                "thumbnails": p.thumbnails if p.thumbnails else "",
                "status": p.status,
                "quantity": p.quantity,
                "tags": p.tags
            })
        return jsonify({"items": out, "total": total, "page": page, "limit": limit})
    except Exception as e:
        current_app.logger.exception("api_search failed")
        return jsonify({"error": "search failed", "detail": str(e)}), 500

