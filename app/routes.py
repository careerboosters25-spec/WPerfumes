# app/routes.py
from flask import Blueprint, request, jsonify, session, render_template, url_for, redirect, current_app
from flask_mail import Message
from datetime import datetime
from . import db, mail
from .models import Brand, Product, HomepageProduct, Coupon, Order, OrderAttempt, Story
from sqlalchemy import or_, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import re
import uuid

bp = Blueprint("main", __name__)


def to_static_url(path):
    """
    Convert a stored image path like 'images/creed/aventus.jpg'
    into a browser URL '/static/images/creed/aventus.jpg'.
    If path already starts with '/' or 'http', return as-is.
    """
    if not path:
        return "/static/images/placeholder.jpg"
    if isinstance(path, str) and (path.startswith("http://") or path.startswith("https://") or path.startswith("/")):
        return path
    return "/static/" + path.lstrip("/")


def _sanitize_price_server(raw):
    """
    Robustly coerce a client-supplied price into a float or return None if not parseable.
    Accepts numeric types or strings containing currency symbols, grouping separators and
    different decimal separators. Attempts to normalize and return float.
    """
    if raw is None:
        return None
    # already numeric
    if isinstance(raw, (int, float)):
        try:
            return float(raw)
        except Exception:
            return None

    s = str(raw).strip()
    if s == "":
        return None

    s = re.sub(r'[\u00A0\s£$€¥₹]', '', s)

    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '')
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s and '.' not in s:
        # ambiguous single separator: if the part after last comma has 3 digits -> thousands separator -> remove commas
        parts = s.split(',')
        if len(parts[-1]) == 3:
            s = s.replace(',', '')
        else:
            # treat comma as decimal separator
            s = s.replace(',', '.')
    # else: no commas, dots left as-is

    # strip any remaining non-digit/dot/minus characters
    s = re.sub(r'[^0-9.\-]', '', s)

    # normalize multiple dots: keep first as decimal separator
    parts = s.split('.')
    if len(parts) > 2:
        s = parts[0] + '.' + ''.join(parts[1:])

    # avoid bare '-', '.' or '-.'
    if s in ('', '-', '.', '-.'):
        return None

    try:
        return float(s)
    except Exception:
        return None


# -------------------------
# PRD code helpers (deterministic smallest-missing allocation)
# -------------------------
PRD_RE = re.compile(r"^PRD0*([0-9]+)$", re.IGNORECASE)


def _parse_prd_num(code):
    if not code:
        return None
    m = PRD_RE.match(str(code).strip().upper())
    if not m:
        return None
    try:
        return int(m.group(1))
    except Exception:
        return None


def _format_prd(n):
    return f"PRD{int(n):04d}"


def _compute_prd_candidate(requested_code=None):
    """
    Compute the smallest positive integer N such that 'PRD{N:04d}' is not used by any
    existing product.code or existing product_code table entry.

    This implementation prioritizes scanning existing Product.code values and ProductCode rows
    to find the smallest gap (1..). This avoids returning a very large sequence value
    produced by a previously advanced DB sequence.
    """
    nums = set()

    # gather numeric codes from Product.code
    try:
        rows = Product.query.with_entities(Product.code).all()
        for (c,) in rows:
            n = _parse_prd_num(c)
            if n:
                nums.add(n)
    except Exception as exc:
        # ensure session usable afterwards
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.debug(
            "Failed scanning Product.code for PRD candidate: %s", exc, exc_info=True)

    # gather numeric codes from ProductCode table if present
    try:
        from .models import ProductCode  # may not exist
        try:
            rows = ProductCode.query.with_entities(ProductCode.num).all()
            for (num,) in rows:
                try:
                    if num is not None:
                        nums.add(int(num))
                except Exception:
                    continue
        except Exception as exc:
            try:
                db.session.rollback()
            except Exception:
                pass
            current_app.logger.debug(
                "Failed scanning ProductCode for PRD candidate: %s", exc, exc_info=True)
    except Exception:
        # ProductCode model absent — that's fine
        pass

    # If requested_code is numeric and free, return it
    if requested_code:
        rn = _parse_prd_num(requested_code)
        if rn and rn not in nums:
            return _format_prd(rn)

    # Find the smallest missing positive integer
    i = 1
    while True:
        if i not in nums:
            return _format_prd(i)
        i += 1


def _persist_prd_mapping(product_id, code, product_name=None):
    """
    Best-effort: persist a mapping into ProductCode table if it exists.
    Errors are logged and session is rolled back but do not affect the already-created product.
    """
    if not code:
        return
    try:
        from .models import ProductCode
        rn = _parse_prd_num(code)
        if rn:
            existing = ProductCode.query.filter_by(num=rn).first()
            if existing:
                # claim if unassigned
                if existing.product_id is None or existing.product_id == product_id:
                    existing.product_id = product_id
                    if product_name:
                        existing.product_name = product_name
                    db.session.add(existing)
                    db.session.commit()
                    return
                # otherwise it's taken; log and exit
                current_app.logger.warning(
                    "ProductCode %s is already assigned to %s", code, existing.product_id)
                return
            else:
                pc = ProductCode(num=rn, product_id=product_id,
                                 product_name=product_name)
                db.session.add(pc)
                db.session.commit()
                return
        else:
            # fallback: create a reservation row with no numeric mapping
            pc = ProductCode(product_id=product_id, product_name=product_name)
            db.session.add(pc)
            db.session.commit()
            return
    except Exception as exc:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.debug(
            "Failed to persist product code mapping %s -> %s: %s", product_id, code, exc, exc_info=True)
        return


def _free_prd_mapping(product_id=None, code=None):
    """
    Best-effort: free mapping(s) from ProductCode if present.
    """
    try:
        from .models import ProductCode
        q = ProductCode.query
        if product_id:
            q = q.filter(ProductCode.product_id == product_id)
        elif code:
            q = q.filter(ProductCode.code == code)
        else:
            return
        for row in q.all():
            row.product_id = None
            db.session.add(row)
        db.session.commit()
    except Exception as exc:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.debug(
            "Failed to free product code mapping %s/%s: %s", product_id, code, exc, exc_info=True)
        return


# -------------------------
# Helper: safe logo setter for Brand instances
# -------------------------
def _set_brand_logo_safe(brand_obj, logo_val):
    """
    Some Brand model implementations expose a read-only property 'logo_url' that
    constructs a URL from an underlying column (for example 'logo' or 'logo_path').
    This helper attempts to set the appropriate underlying column instead of
    assigning to a property with no setter. It logs and raises on failure.
    """
    if logo_val is None:
        return
    # Try direct assignment first (may raise AttributeError if property has no setter)
    try:
        brand_obj.logo_url = logo_val
        return
    except AttributeError:
        # fall through to try underlying columns
        pass
    except Exception:
        # Some unexpected error - log and continue trying other strategies
        current_app.logger.debug(
            "Unexpected error assigning logo_url directly", exc_info=True)

    # Try to inspect mapped column names
    col_names = []
    try:
        # If the model has __table__ (SQLAlchemy declarative), gather columns
        if hasattr(brand_obj, "__table__"):
            col_names = [c.name for c in brand_obj.__table__.columns]
    except Exception:
        col_names = []

    # Candidate underlying field names commonly used
    candidates = ['logo', 'logo_url', 'logo_path',
                  'image_url', 'logo_filename', 'image']
    for cand in candidates:
        if cand in col_names:
            try:
                setattr(brand_obj, cand, logo_val)
                return
            except Exception:
                # continue to next candidate
                current_app.logger.debug(
                    "Failed to set brand.%s", cand, exc_info=True)
                continue

    # If no known mapped column found, attempt to set common attribute names
    for cand in ['logo', 'image_url', 'logo_path', 'logo_url']:
        try:
            setattr(brand_obj, cand, logo_val)
            return
        except Exception:
            continue

    # As a last resort, set a private attribute on the instance (non-persistent)
    # This won't persist if there's no mapped column, but avoids raising AttributeError.
    try:
        brand_obj.__dict__['logo_url'] = logo_val
        current_app.logger.debug(
            "Assigned logo_val to brand.__dict__['logo_url'] as fallback")
    except Exception:
        current_app.logger.exception(
            "Failed to set logo value on Brand object (no known setter/column)")


# -------------------------
# Story helpers
# -------------------------
def _get_published_story_for_section_or_slug(section_or_slug):
    """
    Resolve a story to show on a simple section page (e.g. 'history' or 'about').
    Priority:
      1) Story with slug == section_or_slug and published=True
      2) Most recent Story with section == section_or_slug and published=True
      3) None
    """
    if not section_or_slug:
        return None
    # exact slug match
    s = Story.query.filter_by(slug=section_or_slug, published=True).first()
    if s:
        return s
    # fallback: latest published story in this section
    s2 = Story.query.filter_by(section=section_or_slug, published=True) \
        .order_by(Story.published_at.desc().nullslast(), Story.created_at.desc()) \
        .first()
    return s2


def _get_published_stories_for_section(section, limit=None, page=1):
    """
    Return a list of published stories for the given section, newest first.
    If section is None or empty, return all published stories.
    Pagination via limit/page if provided.
    """
    q = Story.query.filter_by(published=True)
    if section:
        q = q.filter_by(section=section)
    q = q.order_by(Story.published_at.desc().nullslast(),
                   Story.created_at.desc())
    if limit:
        try:
            limit = int(limit)
        except Exception:
            limit = None
    try:
        page = int(page) if page and int(page) > 0 else 1
    except Exception:
        page = 1
    if limit:
        q = q.limit(limit).offset((page - 1) * limit)
    return q.all()


def _render_story_page_or_fallback(story, fallback_title, fallback_html):
    """
    Given a Story (or None) render content_page.html with story data or fallback markup.
    """
    if story:
        data = story.to_public_dict()
        images = []
        if data.get("featured_image"):
            images = [data.get("featured_image")]
        meta = {
            "author": data.get("author"),
            "published_at": data.get("published_at")
        }
        return render_template("content_page.html", title=data.get("title"), body_html=data.get("body_html"), images=images, meta=meta)
    # fallback
    return render_template("content_page.html", title=fallback_title, body_html=fallback_html, images=[], meta={})


# -------------------------
# Page routes
# -------------------------
@bp.route('/admin')
def admin_dashboard():
    return render_template('admin.html')


@bp.route('/brands')
def brands():
    """
    Render the brands listing page. Pass the server-side brands data to the template so:
      - server-side rendered fallback list (Jinja for-loop) works
      - client-side JS (window.BRANDS) can use the data without an API fetch
    The Brand model stores logo path via Brand.logo_url property (e.g. 'images/creed/aventus.jpg')
    which the templates use with url_for('static', filename=...).
    """
    try:
        brand_objs = Brand.query.order_by(Brand.name).all()
        # pass a list of lightweight dicts (logo path kept as stored path so template's url_for works)
        brands_list = []
        for b in brand_objs:
            brands_list.append({
                "id": getattr(b, "id", None),
                "name": b.name,
                "logo_url": getattr(b, "logo_url", "") or getattr(b, "logo", "") or "",
                "description": b.description or "",
                # include gender if model later extended; safe default ''
                "gender": getattr(b, "gender", "") if hasattr(b, "gender") else ""
            })
    except Exception:
        # In case DB is unavailable, render page with empty list to avoid template crash
        current_app.logger.exception(
            "Failed to load brands for /brands; rendering empty list")
        brands_list = []

    return render_template('brands.html', brands=brands_list)


@bp.route('/brands.html')
def brands_html():
    """
    Backwards-compatible route so requests to /brands.html render the same brands.html page.
    Reuses the same logic as /brands by calling the brands() view.
    This ensures links or static-style references to /brands.html (from legacy templates)
    work correctly without 404s.
    """
    return brands()


@bp.route('/brand')
def brand():
    return render_template('brand.html')


@bp.route('/brand_detail')
def brand_detail():
    return render_template('brand_detail.html')


@bp.route('/checkout')
def checkout():
    return render_template('checkout.html')


@bp.route('/cart')
def cart():
    return render_template('cart.html')


@bp.route('/forgot_password')
def forgot_password():
    return render_template('forgot_password.html')


# -------------------------
# Auth endpoints
# -------------------------
@bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    # Accept either username or email (frontend uses email in many places)
    identity = (data.get('username') or data.get('email') or "").strip()
    password = data.get('password') or ""
    # Simple demo auth: allow admin/password123 or admin@example.com/password123
    if (identity.lower() in ('admin', 'admin@example.com')) and password == 'password123':
        session['user'] = identity
        return jsonify({"user": {"username": "admin", "role": "admin"}})
    return jsonify({"error": "Invalid credentials"}), 401


@bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"success": True})


# -------------------------
# Brands / Products API
# -------------------------
@bp.route('/api/brands', methods=['GET'])
def get_brands():
    brands = Brand.query.order_by(Brand.name).all()
    # include id so admin UI can operate by id
    return jsonify([{
        "id": getattr(b, "id", None),
        "name": b.name,
        "logo": to_static_url(getattr(b, "logo_url", "") or getattr(b, "logo", "") or ""),
        "description": b.description
    } for b in brands])


@bp.route('/api/brands', methods=['POST'])
def add_brand():
    data = request.json or {}
    brand = Brand(name=data.get("name"),
                  description=data.get("description", ""))
    # accept logo or logo_url field from admin UI; store in underlying column if logo_url property is read-only
    logo_val = data.get("logo") or data.get("logo_url")
    try:
        _set_brand_logo_safe(brand, logo_val)
    except Exception:
        current_app.logger.exception(
            "Failed to set logo on new Brand instance")

    try:
        db.session.add(brand)
        db.session.commit()
    except Exception as exc:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception("Failed to create brand: %s", exc)
        return jsonify({"error": "create_failed", "detail": str(exc)}), 500
    return jsonify({"success": True, "id": getattr(brand, "id", None)})


@bp.route('/api/brands/<name>', methods=['PUT'])
def update_brand(name):
    b = Brand.query.filter_by(name=name).first()
    if not b:
        return jsonify({"error": "Brand not found"}), 404
    data = request.json or {}
    b.description = data.get("description", b.description)
    logo_val = data.get("logo") or data.get("logo_url")
    try:
        _set_brand_logo_safe(b, logo_val)
    except Exception:
        current_app.logger.exception(
            "Failed to set logo on Brand during update")
    db.session.commit()
    return jsonify({"success": True})


@bp.route('/api/brands/<name>', methods=['DELETE'])
def delete_brand(name):
    b = Brand.query.filter_by(name=name).first()
    if b:
        try:
            # Gather product ids that belong to this brand
            product_ids = [
                p.id for p in Product.query.filter_by(brand=name).all()]
            if product_ids:
                HomepageProduct.query.filter(HomepageProduct.product_id.in_(
                    product_ids)).delete(synchronize_session=False)
                Product.query.filter(Product.id.in_(product_ids)).delete(
                    synchronize_session=False)

            db.session.delete(b)
            db.session.commit()
            return jsonify({"success": True})
        except Exception as exc:
            try:
                db.session.rollback()
            except Exception:
                pass
            current_app.logger.exception(
                "Failed to delete brand %s: %s", name, exc)
            return jsonify({"error": "delete_failed", "detail": str(exc)}), 500
    return jsonify({"error": "Brand not found"}), 404


# NEW: GET/PUT/DELETE by numeric id (safer for client use)
@bp.route('/api/brands/<int:brand_id>', methods=['GET'])
def get_brand_by_id(brand_id):
    b = Brand.query.get(brand_id)
    if not b:
        return jsonify({"error": "Brand not found"}), 404
    return jsonify({
        "id": b.id,
        "name": b.name,
        "logo": to_static_url(getattr(b, "logo_url", "") or getattr(b, "logo", "") or ""),
        "description": b.description
    })


@bp.route('/api/brands/<int:brand_id>', methods=['PUT'])
def update_brand_by_id(brand_id):
    b = Brand.query.get(brand_id)
    if not b:
        return jsonify({"error": "Brand not found"}), 404
    data = request.json or {}

    new_name = data.get("name", b.name)
    logo_val = data.get("logo") or data.get("logo_url")
    new_description = data.get("description", b.description)

    try:
        # If the name is changing, update Product.brand references first so there are no orphaned products
        if new_name and new_name != b.name:
            try:
                Product.query.filter_by(brand=b.name).update(
                    {"brand": new_name}, synchronize_session=False)
            except Exception:
                db.session.rollback()
                current_app.logger.exception(
                    "Failed to update products while renaming brand %s -> %s", b.name, new_name)
                return jsonify({"error": "failed_updating_products_on_rename"}), 500

        b.name = new_name
        if new_description is not None:
            b.description = new_description

        # set logo safely
        try:
            _set_brand_logo_safe(b, logo_val)
        except Exception:
            current_app.logger.exception(
                "Failed to set logo during update_brand_by_id")

        db.session.commit()
        return jsonify({"success": True})
    except Exception as exc:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "Failed to update brand %s: %s", brand_id, exc)
        return jsonify({"error": "update_failed", "detail": str(exc)}), 500


@bp.route('/api/brands/<int:brand_id>', methods=['DELETE'])
def delete_brand_by_id(brand_id):
    b = Brand.query.get(brand_id)
    if b:
        try:
            product_ids = [
                p.id for p in Product.query.filter_by(brand=b.name).all()]
            if product_ids:
                HomepageProduct.query.filter(HomepageProduct.product_id.in_(
                    product_ids)).delete(synchronize_session=False)
                Product.query.filter(Product.id.in_(product_ids)).delete(
                    synchronize_session=False)
            db.session.delete(b)
            db.session.commit()
            return jsonify({"success": True})
        except Exception as exc:
            try:
                db.session.rollback()
            except Exception:
                pass
            current_app.logger.exception(
                "Failed to delete brand %s: %s", brand_id, exc)
            return jsonify({"error": "delete_failed", "detail": str(exc)}), 500
    return jsonify({"error": "Brand not found"}), 404


# -------------------------
# Products endpoints (unchanged behaviour, FK-safe deletes applied where needed)
# -------------------------
@bp.route('/api/products', methods=['GET'])
def get_products():
    """
    Return a list of products. Prefer using Product.to_dict() so product.code is included.
    Supports optional ?q= and ?limit= for simple searching and limiting.
    """
    q_param = request.args.get('q', None)
    limit = request.args.get('limit', type=int)

    query = Product.query
    if q_param:
        like = f"%{q_param}%"
        query = query.filter(
            or_(
                Product.title.ilike(like),
                Product.brand.ilike(like),
                Product.code.ilike(like),
                Product.tags.ilike(like)
            )
        )
    query = query.order_by(Product.title)
    if limit and limit > 0:
        query = query.limit(limit)
    products = query.all()
    return jsonify([p.to_dict() for p in products])


@bp.route('/api/products', methods=['POST'])
def add_product():
    # Ensure any previous aborted transaction is cleared before we start.
    try:
        db.session.rollback()
    except Exception:
        # ignore if rollback itself fails (rare)
        pass

    data = request.json or {}

    # sanitize incoming price robustly
    raw_price = data.get("price")
    price_val = _sanitize_price_server(raw_price)
    price = price_val if (price_val is not None) else 0.0

    # safe quantity parse
    try:
        quantity = int(data.get("quantity", 10))
    except Exception:
        quantity = 10

    # Ensure a primary key id for Product: prefer supplied id, else generate UUID
    incoming_id = data.get("id") or data.get("product_id") or None
    if not incoming_id:
        incoming_id = str(uuid.uuid4())

    # Compute a PRD candidate using smallest-missing algorithm
    try:
        prd_candidate = _compute_prd_candidate(requested_code=None)
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "Failed to compute PRD candidate, falling back: %s", e)
        prd_candidate = f"PRD{uuid.uuid4().int % 1000000:06d}"

    product = Product(
        id=incoming_id,
        brand=data.get("brand"),
        title=data.get("title"),
        price=price,
        description=data.get("description", ""),
        keyNotes=data.get("keyNotes", ""),
        image_url=data.get("image_url", data.get("imageUrl", "")),
        thumbnails=data.get("thumbnails", ""),
        status=data.get("status", "restocked"),
        quantity=quantity,
        tags=data.get("tags", "")
    )

    # set candidate code on the object (persisted with product insert)
    product.code = prd_candidate

    # Try to insert Product. Any previous DB abort would already have been rolled back above.
    try:
        db.session.add(product)
        db.session.commit()
    except IntegrityError as ie:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception("IntegrityError creating Product: %s", ie)
        return jsonify({"error": "integrity_error", "detail": str(ie)}), 400
    except SQLAlchemyError as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception("DB error creating Product: %s", e)
        return jsonify({"error": "database_write_failed", "detail": str(e)}), 500

    # After successful commit, best-effort persist mapping in ProductCode table (if present).
    # Do this as a separate step so mapping failures don't abort the inserted product.
    try:
        _persist_prd_mapping(product.id, product.code,
                             product_name=product.title)
    except Exception:
        current_app.logger.debug(
            "Persisting PRD mapping failed for %s -> %s", product.id, product.code, exc_info=True)
        try:
            db.session.rollback()
        except Exception:
            pass

    # Return the assigned code so frontend can show it (and we did not accept admin-supplied manual codes).
    return jsonify({"success": True, "id": product.id, "code": product.code})


@bp.route('/api/products/<id>', methods=['PUT'])
def update_product(id):
    # Try primary key lookup first, then fallback to code lookup if not found
    prod = Product.query.filter_by(id=id).first()
    if not prod:
        prod = Product.query.filter_by(code=id).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404
    data = request.json or {}

    prod.title = data.get("title", prod.title)
    prod.brand = data.get("brand", prod.brand)

    # Robust price handling: only update if we can parse the incoming value
    if "price" in data:
        raw_price = data.get("price")
        price_val = _sanitize_price_server(raw_price)
        if price_val is not None:
            prod.price = price_val
        else:
            # If client explicitly sent an empty string or invalid value, set to 0.0
            try:
                # treat empty string as 0 if that's what client intended
                if raw_price == "" or raw_price is None:
                    prod.price = 0.0
            except Exception:
                pass

    prod.description = data.get("description", prod.description)
    prod.keyNotes = data.get("keyNotes", prod.keyNotes)
    prod.image_url = data.get("image_url", prod.image_url)
    prod.thumbnails = data.get("thumbnails", prod.thumbnails)
    prod.status = data.get("status", prod.status)
    # safe quantity parse
    if "quantity" in data:
        try:
            prod.quantity = int(data.get("quantity", prod.quantity))
        except Exception:
            # keep existing if parse fails
            pass
    prod.tags = data.get("tags", prod.tags)

    # allow updating human-friendly code (if provided)
    if "code" in data:
        new_code = data.get("code")
        # Accept empty to clear, or set new value
        if new_code:
            # Attempt to allocate the requested code if possible (reassign)
            try:
                # If another product already uses this code, block
                existing = Product.query.filter(Product.code == new_code).filter(
                    Product.id != prod.id).first()
                if existing:
                    return jsonify({"error": "code_in_use"}), 400
                # free old code if present
                old_code = prod.code
                prod.code = new_code
                # commit and update allocator bookkeeping
                db.session.add(prod)
                db.session.commit()
                try:
                    # mark product_code mapping if present
                    _persist_prd_mapping(
                        prod.id, new_code, product_name=prod.title)
                    if old_code:
                        _free_prd_mapping(code=old_code)
                    # no need to commit here if underlying helper commits; helpers do commit
                except Exception:
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                return jsonify({"success": True})
            except Exception:
                try:
                    db.session.rollback()
                except Exception:
                    pass
                return jsonify({"error": "code_update_failed"}), 500
        else:
            # Clearing code: allow but free the existing slot
            old = prod.code
            prod.code = None
            try:
                db.session.add(prod)
                db.session.commit()
                if old:
                    _free_prd_mapping(code=old)
            except Exception:
                try:
                    db.session.rollback()
                except Exception:
                    pass

    try:
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception("Failed to update product %s", id)
        return jsonify({"error": "update_failed"}), 500

    return jsonify({"success": True})


@bp.route('/api/products/<id>', methods=['DELETE'])
def delete_product(id):
    # Try by id then by code
    prod = Product.query.filter_by(id=id).first()
    if not prod:
        prod = Product.query.filter_by(code=id).first()
    if prod:
        # capture code to free after deletion
        code_to_free = prod.code
        pid_to_free = prod.id
        try:
            # Before deleting product, remove homepage entries that reference it to avoid FK errors
            try:
                HomepageProduct.query.filter(HomepageProduct.product_id == prod.id).delete(
                    synchronize_session=False)
            except Exception:
                # if homepage deletion fails, rollback and return error
                db.session.rollback()
                current_app.logger.exception(
                    "Failed to delete homepage entries referencing product %s", prod.id)
                return jsonify({"error": "failed_deleting_homepage_entries"}), 500

            db.session.delete(prod)
            db.session.commit()
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            current_app.logger.exception("Failed to delete product %s", id)
            return jsonify({"error": "delete_failed"}), 500

        # Free PRD code (best-effort)
        try:
            if code_to_free or pid_to_free:
                _free_prd_mapping(product_id=pid_to_free, code=code_to_free)
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            # non-fatal
            current_app.logger.debug(
                "free_prd_code_for_product failed for %s / %s", pid_to_free, code_to_free, exc_info=True)

        return jsonify({"success": True})
    return jsonify({"error": "Product not found"}), 404


# -------------------------
# Homepage products helpers / CRUD (unchanged)
# -------------------------
def _lookup_homepage_entry(identifier):
    if identifier is None:
        return None
    # try integer pk first
    try:
        pid = int(identifier)
        hp = HomepageProduct.query.get(pid)
        if hp:
            return hp
    except Exception:
        pass
    # fallback: match by product_id (string)
    try:
        return HomepageProduct.query.filter_by(product_id=str(identifier)).first()
    except Exception:
        return None


@bp.route('/api/homepage-products', methods=['GET'])
def get_homepage_products():
    homepage_products = HomepageProduct.query.order_by(
        HomepageProduct.section, HomepageProduct.sort_order).all()
    products = {p.id: p for p in Product.query.all()}
    result = {"signature": [], "men": [], "women": [], "offers": []}
    for hp in homepage_products:
        if not hp.visible:
            continue
        prod = products.get(hp.product_id)
        if prod:
            result.setdefault(hp.section, []).append({
                "homepage_id": hp.homepage_id,
                "section": hp.section,
                "id": prod.id,
                "code": prod.code,
                "title": prod.title,
                "brand": prod.brand,
                "price": prod.price,
                "image_url": to_static_url(prod.image_url or getattr(prod, "image_url_dynamic", "")),
                "sort_order": hp.sort_order,
                "visible": hp.visible
            })
    return jsonify(result)


@bp.route('/api/homepage-products', methods=['POST'])
def add_homepage_product():
    data = request.json or {}
    sort_val = data.get("sort_order", data.get("position", 0))
    try:
        sort_order = int(sort_val)
    except Exception:
        sort_order = 0

    product_id = data.get("product_id")
    if not product_id:
        return jsonify({"error": "product_id_required"}), 400

    prod = Product.query.filter_by(id=product_id).first()
    if not prod:
        return jsonify({"error": "product_not_found", "product_id": product_id}), 400

    visible_val = data.get("visible", True)
    visible = bool(visible_val)
    hp = HomepageProduct(
        section=data.get("section"),
        product_id=product_id,
        sort_order=sort_order,
        visible=visible
    )
    try:
        db.session.add(hp)
        db.session.commit()
    except IntegrityError as ie:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "IntegrityError creating HomepageProduct: %s", ie)
        return jsonify({"error": "integrity_error", "detail": str(ie)}), 400
    except SQLAlchemyError as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "DB error creating HomepageProduct: %s", e)
        return jsonify({"error": "database_write_failed", "detail": str(e)}), 500

    return jsonify({"success": True, "homepage_id": hp.homepage_id}), 201


@bp.route('/api/homepage-products/<string:homepage_id>', methods=['PUT'])
def update_homepage_product(homepage_id):
    hp = _lookup_homepage_entry(homepage_id)
    if not hp:
        return jsonify({"error": "Homepage product not found"}), 404
    data = request.json or {}
    sort_val = data.get("sort_order", data.get("position", hp.sort_order))
    try:
        hp.sort_order = int(sort_val)
    except Exception:
        pass

    if "product_id" in data:
        new_pid = data.get("product_id")
        if not new_pid:
            return jsonify({"error": "product_id_required"}), 400
        prod = Product.query.filter_by(id=new_pid).first()
        if not prod:
            return jsonify({"error": "product_not_found", "product_id": new_pid}), 400
        hp.product_id = new_pid

    hp.section = data.get("section", hp.section)

    if "visible" in data:
        v = data.get("visible")
        if isinstance(v, bool):
            hp.visible = v
        elif isinstance(v, str):
            hp.visible = v.lower() in ("1", "true", "yes", "on")
        else:
            hp.visible = bool(v)
    try:
        db.session.commit()
    except IntegrityError as ie:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "IntegrityError updating HomepageProduct %s: %s", homepage_id, ie)
        return jsonify({"error": "integrity_error", "detail": str(ie)}), 400
    except SQLAlchemyError as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "DB error updating HomepageProduct %s: %s", homepage_id, e)
        return jsonify({"error": "database_write_failed", "detail": str(e)}), 500
    return jsonify({"success": True, "homepage_id": hp.homepage_id}), 200


@bp.route('/api/homepage-products/<string:homepage_id>', methods=['DELETE'])
def delete_homepage_product(homepage_id):
    hp = _lookup_homepage_entry(homepage_id)
    if not hp:
        return jsonify({"error": "Homepage product not found"}), 404
    try:
        db.session.delete(hp)
        db.session.commit()
    except SQLAlchemyError as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception(
            "DB error deleting HomepageProduct %s: %s", homepage_id, e)
        return jsonify({"error": "database_delete_failed", "detail": str(e)}), 500
    return jsonify({"success": True})


# -------------------------
# Cart / Orders / Coupons / Pages etc.
# (These endpoints mirror the previously working implementation)
# -------------------------
@bp.route('/api/cart/add', methods=['POST'])
def add_to_cart():
    data = request.json or {}
    product_id = data.get("product_id")
    try:
        qty = int(data.get("quantity", 1))
    except Exception:
        qty = 1
    prod = Product.query.filter_by(id=product_id).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404
    if prod.quantity < qty:
        return jsonify({"error": "Sold Out", "quantity_left": prod.quantity}), 400
    prod.quantity -= qty
    db.session.commit()
    if prod.quantity == 0:
        prod.status = "out-of-stock"
        db.session.commit()
    return jsonify({"success": True, "quantity_left": prod.quantity})


@bp.route('/api/order-attempts', methods=['POST'])
def log_order_attempt():
    data = request.json or {}
    attempt = OrderAttempt(
        email=data.get("email", ""),
        product=data.get("product", ""),
        qty=data.get("qty", 1),
        status=data.get("status", "Carted"),
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.session.add(attempt)
    db.session.commit()
    return jsonify({"success": True})


@bp.route('/api/products/similar', methods=['GET'])
def get_similar_products():
    product_id = request.args.get("product_id")
    prod = Product.query.filter_by(id=product_id).first()
    if not prod or not prod.tags:
        return jsonify([])
    tag_list = [t.strip().lower() for t in prod.tags.split(',') if t.strip()]
    similar = Product.query.filter(Product.id != prod.id).all()
    result = []
    for p in similar:
        if not p.tags:
            continue
        ptags = set([tt.strip().lower()
                    for tt in p.tags.split(',') if tt.strip()])
        if set(tag_list) & ptags:
            result.append({
                "id": p.id,
                "title": p.title,
                "brand": p.brand,
                "image_url": to_static_url(p.image_url or getattr(p, "image_url_dynamic", "")),
                "thumbnails": p.thumbnails if p.thumbnails else "",
                "tags": p.tags
            })
    return jsonify(result)


@bp.route('/api/coupons', methods=['GET'])
def get_coupons():
    coupons = Coupon.query.order_by(Coupon.start_date.desc()).all()
    return jsonify([
        {
            "code": c.code,
            "description": c.description,
            "discount_type": c.discount_type,
            "discount_value": c.discount_value,
            "start_date": c.start_date,
            "end_date": c.end_date,
            "active": c.active
        }
        for c in coupons
    ])


@bp.route('/api/coupons', methods=['POST'])
def add_coupon():
    data = request.json or {}
    c = Coupon.query.filter_by(code=data.get("code")).first()
    if c:
        db.session.delete(c)
        db.session.commit()
    active_val = data.get("active", True)
    if isinstance(active_val, bool):
        active = active_val
    elif isinstance(active_val, str):
        active = active_val.lower() == "true"
    else:
        active = bool(active_val)
    coupon = Coupon(
        code=data.get("code"),
        description=data.get("description", ""),
        discount_type=data.get("discount_type", "percent"),
        discount_value=float(data.get("discount_value", 0)),
        start_date=data.get("start_date", ""),
        end_date=data.get("end_date", ""),
        active=active
    )
    db.session.add(coupon)
    db.session.commit()
    return jsonify({"success": True})


@bp.route('/api/coupons/<code>', methods=['PUT'])
def update_coupon(code):
    coupon = Coupon.query.filter_by(code=code).first()
    if not coupon:
        return jsonify({"error": "Coupon not found"}), 404
    data = request.json or {}
    coupon.description = data.get("description", coupon.description)
    coupon.discount_type = data.get("discount_type", coupon.discount_type)
    coupon.discount_value = float(
        data.get("discount_value", coupon.discount_value))
    coupon.start_date = data.get("start_date", coupon.start_date)
    coupon.end_date = data.get("end_date", coupon.end_date)
    active_val = data.get("active", coupon.active)
    if isinstance(active_val, bool):
        coupon.active = active_val
    elif isinstance(active_val, str):
        coupon.active = active_val.lower() == "true"
    else:
        coupon.active = bool(active_val)
    db.session.commit()
    return jsonify({"success": True})


@bp.route('/api/coupons/<code>', methods=['DELETE'])
def delete_coupon(code):
    coupon = Coupon.query.filter_by(code=code).first()
    if coupon:
        db.session.delete(coupon)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Coupon not found"}), 404


@bp.route('/api/orders', methods=['GET'])
def get_orders():
    orders = Order.query.order_by(Order.date.desc()).all()
    return jsonify([
        {
            "id": o.id,
            "customer_name": o.customer_name,
            "customer_email": o.customer_email,
            "customer_phone": o.customer_phone,
            "customer_address": o.customer_address,
            "product_id": o.product_id,
            "product_title": o.product_title,
            "quantity": o.quantity,
            "status": o.status,
            "payment_method": o.payment_method,
            "date": o.date
        }
        for o in orders
    ])


@bp.route('/api/orders', methods=['POST'])
def add_order():
    data = request.json or {}
    customer_name = data.get("customer_name") or data.get("customer") or ""
    customer_email = data.get("customer_email") or data.get("email") or ""
    customer_phone = data.get("customer_phone") or data.get("phone") or ""
    customer_address = data.get(
        "customer_address") or data.get("address") or ""
    product_id = data.get("product_id") or ""
    product_title = data.get("product_title") or data.get("product") or ""
    # Accept both 'quantity' and 'qty' (fallback to 1)
    try:
        quantity = int(data.get("quantity") or data.get("qty") or 1)
    except Exception:
        quantity = 1
    status = data.get("status", "Pending")
    payment_method = data.get("payment_method", "Cash on Delivery")
    date = data.get("date", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    order = Order(
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
        customer_address=customer_address,
        product_id=product_id,
        product_title=product_title,
        quantity=quantity,
        status=status,
        payment_method=payment_method,
        date=date
    )

    try:
        db.session.add(order)
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        current_app.logger.exception("Failed to create order: %s", e)
        return jsonify({"error": "order_create_failed", "detail": str(e)}), 500

    email_body = f"""
Hi {customer_name},

Thank you for your order with WPerfumes!

Order Details:
Product: {product_title}
Quantity: {quantity}
Payment Method: {payment_method}
Delivery Address: {customer_address}
Status: {status}
Date: {date}

For any questions, reply to this email.
Best Regards,
WPerfumes Team
"""
    try:
        sender = current_app.config.get('MAIL_USERNAME') or None
        msg = Message(
            subject="Your WPerfumes Order Confirmation",
            sender=sender,
            recipients=[customer_email],
            body=email_body
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.debug(f"Error sending email: {e}")

    try:
        from .routes_top_picks_stub import increment_sales_for_product
        try:
            increment_sales_for_product(product_id, quantity)
        except Exception as inner_exc:
            current_app.logger.debug(
                f"Warning: failed to increment top-picks sales in-memory: {inner_exc}")
    except Exception:
        pass

    return jsonify({"success": True})


@bp.route('/api/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    order = Order.query.filter_by(id=order_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404
    data = request.json or {}
    old_status = order.status

    order.customer_name = data.get("customer_name", order.customer_name)
    order.customer_email = data.get("customer_email", order.customer_email)
    order.customer_phone = data.get("customer_phone", order.customer_phone)
    order.customer_address = data.get(
        "customer_address", order.customer_address)
    order.product_id = data.get("product_id", order.product_id)
    order.product_title = data.get("product_title", order.product_title)
    order.quantity = int(data.get("quantity", order.quantity))
    order.status = data.get("status", order.status)
    order.payment_method = data.get("payment_method", order.payment_method)
    order.date = data.get("date", order.date)
    db.session.commit()

    if order.status != old_status:
        email_body = f"""
Hi {order.customer_name},

Your order for {order.product_title} has been updated!

Order Details:
Product: {order.product_title}
Quantity: {order.quantity}
Payment Method: {order.payment_method}
Delivery Address: {order.customer_address}
Current Status: {order.status}
Date: {order.date}

You can reply to this email if you have any questions.
Best Regards,
WPerfumes Team
        """
        try:
            sender = current_app.config.get('MAIL_USERNAME') or None
            msg = Message(
                subject=f"Order Update: {order.product_title} is now '{order.status}'",
                sender=sender,
                recipients=[order.customer_email],
                body=email_body
            )
            mail.send(msg)
        except Exception as e:
            current_app.logger.debug(f"Error sending update email: {e}")

    return jsonify({"success": True})


@bp.route('/api/orders/<int:order_id>', methods=['DELETE'])
def delete_order(order_id):
    order = Order.query.filter_by(id=order_id).first()
    if order:
        db.session.delete(order)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Order not found"}), 404


# Page routes: offers, index, men, women, beauty, login, signup, brand pages, stories, history, about, favicon
@bp.route('/offers')
def offers():
    return render_template('offers.html')


@bp.route('/')
def index():
    return render_template('index.html')


@bp.route('/men')
def men():
    return redirect(url_for('main.brands'))


@bp.route('/women')
def women():
    return render_template('women.html')


@bp.route('/beauty')
def beauty():
    return render_template('beauty.html')


@bp.route('/login')
def login_page():
    return render_template('login.html')


@bp.route('/signup')
def signup():
    return render_template('signup.html')


@bp.route('/brand/<brand>')
def brand_page(brand):
    return render_template('brand.html')


@bp.route('/brand/<brand>/product/<product>')
def brand_product_page(brand, product):
    return render_template('brand_detail.html')


@bp.route('/story/<slug>')
def story_detail_page(slug):
    s = Story.query.filter_by(slug=slug, published=True).first()
    if not s:
        return render_template('404.html'), 404
    data = s.to_public_dict()
    images = [data.get('featured_image')] if data.get('featured_image') else []
    meta = {"author": data.get(
        'author'), "published_at": data.get('published_at')}
    return render_template('content_page.html', title=data.get('title'), body_html=data.get('body_html'), images=images, meta=meta)


@bp.route('/stories')
def stories_index():
    section = request.args.get('section')
    try:
        limit = int(request.args.get('limit')
                    ) if request.args.get('limit') else None
    except Exception:
        limit = None
    try:
        page = int(request.args.get('page')) if request.args.get('page') else 1
    except Exception:
        page = 1

    stories = _get_published_stories_for_section(
        section, limit=limit, page=page)
    latest = stories[0] if stories else None
    others = stories[1:] if len(stories) > 1 else []
    return render_template('content_section.html', section=section or 'Stories', latest=latest, stories=stories, others=others)


@bp.route('/history')
def history():
    stories = _get_published_stories_for_section('history', limit=None, page=1)
    latest = stories[0] if stories else None
    others = stories[1:] if len(stories) > 1 else []
    return render_template('content_section.html', section='History', latest=latest, stories=stories, others=others)


@bp.route('/checkout_modal')
def checkout_modal_partial():
    return render_template('checkout_modal.html')


@bp.route('/about')
def about():
    stories = _get_published_stories_for_section('about', limit=None, page=1)
    latest = stories[0] if stories else None
    others = stories[1:] if len(stories) > 1 else []
    return render_template('content_section.html', section='About Us', latest=latest, stories=stories, others=others)


@bp.route('/favicon.ico')
def favicon():
    # Return 204 No Content to avoid browser 404 noise (previously returned empty 204).
    return ("", 204)
