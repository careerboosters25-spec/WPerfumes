from flask import Blueprint, request, jsonify, current_app
from .models import Product, Order
from datetime import datetime

"""
Blueprint: top_picks_bp
Temporary in-memory Top Picks CRUD and push endpoint used by admin/front-end.

Endpoints:
- GET    /api/top-picks             -> list of top-picks (auto-enriched with product metadata & live sales_count)
- POST   /api/top-picks             -> create a new top-pick (returns id)
- GET    /api/top-picks/<tp_id>     -> retrieve single top-pick (auto-enriched)
- PUT    /api/top-picks/<tp_id>     -> update top-pick
- DELETE /api/top-picks/<tp_id>     -> delete top-pick
- POST   /api/top-picks/<tp_id>/push-> mark top-pick as pushed (boolean)
Note: storage is in-memory (TOP_PICKS list) and will reset on server restart.
"""

top_picks_bp = Blueprint("top_picks_bp", __name__)

# In-memory store (temporary). Replace with DB-backed model for persistence.
# each item: dict { id, product_id, product_title, brand, tags:list, rank:int, pushed:bool, sales_count:int }
TOP_PICKS = []


def _find_index(tp_id):
    for i, tp in enumerate(TOP_PICKS):
        if str(tp.get("id")) == str(tp_id):
            return i
    return None


# --- Helpers to safely parse and enrich incoming values ---
def safe_int(val, default=0):
    if val is None:
        return default
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        try:
            return int(val)
        except Exception:
            return default
    if isinstance(val, str):
        s = val.strip()
        if s == "":
            return default
        try:
            return int(s)
        except ValueError:
            try:
                return int(float(s))
            except Exception:
                return default
    try:
        return int(val)
    except Exception:
        return default


def safe_bool(val, default=False):
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ("true", "1", "yes", "y", "on"):
            return True
        if s in ("false", "0", "no", "n", "off"):
            return False
        return default
    try:
        return bool(val)
    except Exception:
        return default


def normalize_tags(val):
    if isinstance(val, list):
        return [t for t in (tag.strip() for tag in val) if t]
    if isinstance(val, str):
        return [t for t in (tag.strip() for tag in val.split(",")) if t]
    return []


def compute_sales_count_for_product(product_id):
    """
    Compute sales_count by summing Order.quantity for the product_id.
    Excludes orders where quantity is None. Includes all orders (you can filter by status if you prefer).
    """
    if not product_id:
        return 0
    try:
        orders = Order.query.filter_by(product_id=product_id).all()
        total = sum((o.quantity or 0) for o in orders)
        return int(total)
    except Exception:
        # On failure (e.g. DB not available), fall back to 0
        return 0


def enrich_tp_from_product(tp):
    """
    Given a tp dict, try to fill product_title and brand from Product table.
    Also update sales_count live from Orders.
    Returns a new dict (does not mutate input in case TOP_PICKS is considered source of truth elsewhere).
    """
    tp_copy = tp.copy()
    pid = tp_copy.get("product_id")
    if pid:
        prod = Product.query.filter_by(id=pid).first()
        if prod:
            tp_copy["product_title"] = prod.title or tp_copy.get(
                "product_title") or ""
            tp_copy["brand"] = prod.brand or tp_copy.get("brand") or ""
        # compute live sales_count
        tp_copy["sales_count"] = compute_sales_count_for_product(pid)
    else:
        # no product_id; ensure fields exist
        tp_copy.setdefault("product_title", tp_copy.get("product_title") or "")
        tp_copy.setdefault("brand", tp_copy.get("brand") or "")
        tp_copy.setdefault("sales_count", safe_int(
            tp_copy.get("sales_count", 0), 0))
    return tp_copy


# Provide a small helper so other modules (like routes.add_order) can notify the TOP_PICKS memory when an order occurs.
def increment_sales_for_product(product_id, qty=1):
    """
    Update in-memory TOP_PICKS sales_count for entries that match product_id.
    This is a convenience to get near-real-time reflected values in TOP_PICKS (since the list is in-memory).
    It does not replace the authoritative compute_sales_count_for_product, which always calculates from DB.
    """
    if not product_id:
        return
    try:
        q = int(qty) if qty is not None else 1
    except Exception:
        q = 1
    for tp in TOP_PICKS:
        if str(tp.get("product_id")) == str(product_id):
            tp["sales_count"] = safe_int(tp.get("sales_count", 0)) + q


# --- Routes ---
@top_picks_bp.route("/api/top-picks", methods=["GET"])
def list_top_picks():
    """
    Return enriched list: for each top-pick compute product_title/brand from Product and live sales_count.
    This ensures front-end always sees up-to-date sales without requiring the admin to edit entries.
    """
    enriched = [enrich_tp_from_product(tp) for tp in TOP_PICKS]
    return jsonify(enriched)


@top_picks_bp.route("/api/top-picks", methods=["POST"])
def add_top_pick():
    data = request.get_json(silent=True) or {}
    new_id = str(len(TOP_PICKS) + 1)
    product_id = data.get("product_id")
    # Try to auto-fill product_title/brand from Product if available
    product_title = data.get("product_title") or ""
    brand = data.get("brand") or ""
    if product_id and (not product_title or not brand):
        prod = Product.query.filter_by(id=product_id).first()
        if prod:
            product_title = prod.title or product_title
            brand = prod.brand or brand
    tp = {
        "id": new_id,
        "product_id": product_id,
        "product_title": product_title,
        "brand": brand,
        "tags": normalize_tags(data.get("tags")),
        "rank": safe_int(data.get("rank", 0)),
        "pushed": safe_bool(data.get("pushed", False)),
        # compute initial sales_count from orders
        "sales_count": compute_sales_count_for_product(product_id),
    }
    TOP_PICKS.append(tp)
    return jsonify({"success": True, "id": new_id}), 201


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["GET"])
def get_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(enrich_tp_from_product(TOP_PICKS[idx]))


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["PUT"])
def update_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    tp = TOP_PICKS[idx]
    # Allow product_id changes and auto-fill metadata
    product_id = data.get("product_id", tp.get("product_id"))
    product_title = data.get("product_title", tp.get("product_title"))
    brand = data.get("brand", tp.get("brand"))
    if product_id and (not product_title or not brand):
        prod = Product.query.filter_by(id=product_id).first()
        if prod:
            product_title = prod.title or product_title
            brand = prod.brand or brand
    tp.update({
        "product_id": product_id,
        "product_title": product_title,
        "brand": brand,
        "tags": normalize_tags(data.get("tags")) if "tags" in data else tp.get("tags", []),
        "rank": safe_int(data.get("rank", tp.get("rank", 0))),
        "pushed": safe_bool(data.get("pushed", tp.get("pushed", False))),
        # re-compute sales_count after update
        "sales_count": compute_sales_count_for_product(product_id),
    })
    return jsonify({"success": True})


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["DELETE"])
def delete_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    TOP_PICKS.pop(idx)
    return jsonify({"success": True})


@top_picks_bp.route("/api/top-picks/<tp_id>/push", methods=["POST"])
def push_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    TOP_PICKS[idx]["pushed"] = True
    # When pushed, also refresh sales_count from DB (ensures freshest numbers)
    TOP_PICKS[idx]["sales_count"] = compute_sales_count_for_product(
        TOP_PICKS[idx].get("product_id"))
    return jsonify({"success": True})
