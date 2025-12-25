from flask import Blueprint, jsonify, request
from .models import Product
from . import db

bp = Blueprint('api_products', __name__)


@bp.route('/products', methods=['GET'])
def list_products():
    """
    Return a list of products serialized with Product.to_dict() to ensure product.code is exposed.
    Supports optional ?limit=&?q= query params for convenience.
    """
    q = request.args.get('q', None)
    limit = request.args.get('limit', None)
    query = Product.query
    if q:
        # simple title/brand search (case-insensitive)
        like = f"%{q}%"
        query = query.filter(
            (Product.title.ilike(like)) |
            (Product.brand.ilike(like)) |
            (Product.code.ilike(like)) |
            (Product.tags.ilike(like))
        )
    query = query.order_by(Product.title)
    if limit:
        try:
            n = int(limit)
            query = query.limit(n)
        except Exception:
            pass
    items = query.all()
    return jsonify([p.to_dict() for p in items])


@bp.route('/products/<string:product_id_or_code>', methods=['GET'])
def get_product(product_id_or_code):
    """
    Try to find product by primary id first, then by code.
    Returns 404 JSON if not found.
    """
    p = Product.query.get(product_id_or_code)
    if not p:
        p = Product.query.filter_by(code=product_id_or_code).first()
    if not p:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(p.to_dict())
