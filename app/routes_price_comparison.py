# app/routes_price_comparison.py
import re
import requests
import json
from urllib.parse import quote_plus
from flask import Blueprint, render_template, request, jsonify, current_app
from .models import Product, Setting

price_cmp_bp = Blueprint("price_cmp_bp", __name__)


def _default_competitors():
    return [
        {"name": "VPerfumes", "search_url": "https://www.vperfumes.example/search?q={q}"},
        {"name": "Komodo", "search_url": "https://www.komodo.example/search?q={q}"},
        {"name": "MyOrigines", "search_url": "https://www.myorigines.example/search?q={q}"},
        {"name": "Selfridges", "search_url": "https://www.selfridges.example/search?q={q}"},
        {"name": "DubaiDutyFree",
            "search_url": "https://www.dubaidutyfree.example/search?q={q}"},
        {"name": "Parfum", "search_url": "https://www.parfum.example/search?q={q}"},
    ]


@price_cmp_bp.route("/price-comparison")
@price_cmp_bp.route("/price-comparison/<product_id>")
def price_comparison_page(product_id=None):
    # Render the public page. The template will run client-side JS to call /api/price-compare.
    return render_template("price_comparison.html", product_id=product_id)


@price_cmp_bp.route("/api/price-compare", methods=["GET"])
def api_price_compare():
    """
    GET /api/price-compare?product_id=PRD001
    Returns JSON:
    {
      "product": { id, title, brand, price },
      "comparisons": [ { name, product_id, our_price, competitor_price, manual_price, found_price, effective_price, error }, ... ],
      "ours_is_cheapest": true/false
    }
    """
    product_id = (request.args.get("product_id") or "").strip()
    if not product_id:
        return jsonify({"error": "product_id required"}), 400

    prod = Product.query.filter_by(id=product_id).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404

    # Load competitors from Setting; accept stored JSON or fallback to defaults
    try:
        s = Setting.query.get("price_comparison_competitors")
        if s and s.value:
            try:
                competitors = json.loads(s.value)
            except Exception:
                current_app.logger.debug(
                    "Invalid JSON in price_comparison_competitors; using defaults")
                competitors = _default_competitors()
        else:
            competitors = _default_competitors()
    except Exception:
        current_app.logger.exception(
            "Failed to load price comparison setting; using defaults")
        competitors = _default_competitors()

    # global margin
    try:
        gm = Setting.query.get("price_comparison_global_margin")
        global_margin = float(gm.value) if gm and gm.value is not None else 0.0
    except Exception:
        global_margin = 0.0

    comparisons = []
    our_price = float(prod.price or 0)

    # price regex: currency-prefixed or plain multi-digit number
    price_re = re.compile(
        r'(?P<sym>[$£€])\s?(?P<val>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)'
        r'|(?P<num>\d{2,}(?:[.,]\d+)?)',
        re.UNICODE
    )

    headers = {
        "User-Agent": "WPerfumesPriceCompare/1.0 (+https://your-site.example/)", "Accept": "text/html,application/xhtml+xml"}

    for comp in competitors:
        # normalize keys
        name = comp.get("name") or comp.get("site") or "Unknown"
        tpl = comp.get("search_url") or comp.get("url") or ""
        product_scope = comp.get("product_id") or comp.get("product") or None

        # enforce scoping: if entry targets another product id, skip it
        if product_scope and str(product_scope).strip() and str(product_scope).strip() != str(prod.id):
            continue

        # parse numeric fields
        def to_float(v):
            try:
                if v is None or v == "":
                    return None
                return float(v)
            except Exception:
                return None

        manual_competitor_price = to_float(
            comp.get("competitor_price") or comp.get("manual_price"))
        admin_our_price = to_float(comp.get("our_price"))
        comp_margin = to_float(comp.get("margin"))
        margin_percent = comp_margin if comp_margin is not None else (
            global_margin or 0.0)

        # if admin provided manual competitor price, prefer it (no scraping)
        if isinstance(manual_competitor_price, (int, float)):
            effective_price = manual_competitor_price * \
                (1 - (margin_percent or 0.0) /
                 100.0) if manual_competitor_price is not None else None
            comparisons.append({
                "name": name,
                "product_id": product_scope or prod.id,
                "our_price": admin_our_price if admin_our_price is not None else our_price,
                "competitor_price": manual_competitor_price,
                "manual_price": manual_competitor_price,
                "found_price": None,
                "effective_price": effective_price,
                "margin": margin_percent,
                "error": None,
                "url": tpl or None
            })
            continue

        # if no search URL to use, return an entry indicating missing url
        if not tpl:
            comparisons.append({
                "name": name,
                "product_id": product_scope or prod.id,
                "our_price": admin_our_price if admin_our_price is not None else our_price,
                "competitor_price": None,
                "manual_price": None,
                "found_price": None,
                "effective_price": None,
                "margin": margin_percent,
                "error": "no url template",
                "url": None
            })
            continue

        # build search URL (support {q} and {id})
        if "{q}" in tpl:
            search_url = tpl.replace("{q}", quote_plus(prod.title or ""))
        elif "{id}" in tpl:
            search_url = tpl.replace("{id}", quote_plus(prod.id or ""))
        else:
            search_url = tpl

        try:
            resp = requests.get(search_url, headers=headers, timeout=8)
            if resp.status_code != 200:
                current_app.logger.debug(
                    "price-compare: non-200 %s -> %s", resp.status_code, search_url)
                comparisons.append({
                    "name": name,
                    "product_id": product_scope or prod.id,
                    "our_price": admin_our_price if admin_our_price is not None else our_price,
                    "competitor_price": None,
                    "manual_price": None,
                    "found_price": None,
                    "effective_price": None,
                    "margin": margin_percent,
                    "error": f"fetch failed: HTTP {resp.status_code}",
                    "url": search_url
                })
                continue

            text = resp.text or ""
            lower_text = text.lower()
            title_lower = (prod.title or "").lower()
            window_text = None
            if title_lower and title_lower in lower_text:
                pos = lower_text.find(title_lower)
                start = max(0, pos - 400)
                end = min(len(text), pos + 400)
                window_text = text[start:end]

            def _find_price(txt):
                m = price_re.search(txt or "")
                if not m:
                    return None, None, None
                val = m.group("val") or m.group("num")
                sym = m.group("sym")
                return val, sym, m

            found_price = None
            snippet = None
            search_text = window_text if window_text else text
            val, sym, m = _find_price(search_text)
            if not val and search_text is not text:
                val, sym, m = _find_price(text)
            if val:
                norm = val.strip().replace("\u00A0", "").replace(" ", "")
                # handle thousand/decimal separators
                if norm.count(",") > 0 and norm.count(".") > 0:
                    if norm.rfind(",") < norm.rfind("."):
                        norm = norm.replace(",", "")
                    else:
                        norm = norm.replace(".", "").replace(",", ".")
                else:
                    if norm.count(",") == 1 and norm.count(".") == 0 and len(norm.split(",")[-1]) <= 2:
                        norm = norm.replace(",", ".")
                    else:
                        norm = norm.replace(",", "")
                try:
                    found_price = float(norm)
                except Exception:
                    found_price = None
                snippet = (search_text[m.start():m.start(
                ) + 200].replace("\n", " ").strip() if m else None)

            effective_price = None
            if isinstance(found_price, (int, float)):
                effective_price = found_price * \
                    (1 - (margin_percent or 0.0) / 100.0)

            comparisons.append({
                "name": name,
                "product_id": product_scope or prod.id,
                "our_price": admin_our_price if admin_our_price is not None else our_price,
                "competitor_price": None,
                "manual_price": None,
                "found_price": found_price,
                "effective_price": effective_price,
                "margin": margin_percent,
                "error": None,
                "raw_snippet": snippet,
                "url": search_url
            })

            current_app.logger.debug("price-compare: %s -> found=%s eff=%s margin=%s",
                                     search_url, found_price, effective_price, margin_percent)
        except requests.RequestException as e:
            current_app.logger.debug(
                "price-compare fetch error for %s: %s", search_url, e)
            comparisons.append({
                "name": name,
                "product_id": product_scope or prod.id,
                "our_price": admin_our_price if admin_our_price is not None else our_price,
                "competitor_price": None,
                "manual_price": None,
                "found_price": None,
                "effective_price": None,
                "margin": margin_percent,
                "error": str(e),
                "url": search_url
            })

    # compute whether ours is cheapest vs effective prices
    numeric_effective = [c.get("effective_price") for c in comparisons if isinstance(
        c.get("effective_price"), (int, float)) and c.get("effective_price") > 0]
    ours_is_cheapest = False
    if isinstance(our_price, (int, float)) and our_price >= 0:
        if numeric_effective:
            try:
                min_eff = min(numeric_effective)
                ours_is_cheapest = (our_price <= float(min_eff))
            except Exception:
                ours_is_cheapest = False
        else:
            ours_is_cheapest = False

    return jsonify({
        "product": {"id": prod.id, "title": prod.title, "brand": prod.brand, "price": our_price},
        "comparisons": comparisons,
        "ours_is_cheapest": bool(ours_is_cheapest)
    })

