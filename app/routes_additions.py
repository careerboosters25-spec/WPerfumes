from flask import Blueprint, request, jsonify, current_app

"""
Blueprint: settings_bp
Provides a small settings API used by the front-end:
- GET  /api/settings/checkout_discount   -> { "percent": 0 }
- PUT  /api/settings/checkout_discount   -> { "success": True, "percent": <value> }
This stores the discount value in app.config['CHECKOUT_DISCOUNT'] (temporary).
"""

settings_bp = Blueprint("settings_bp", __name__)


@settings_bp.route("/api/settings/checkout_discount", methods=["GET"])
def get_checkout_discount():
    """Return the currently configured checkout discount percent."""
    cfg = current_app.config.get("CHECKOUT_DISCOUNT", {"percent": 0})
    # Ensure numeric percent
    try:
        percent = float(cfg.get("percent", 0))
    except Exception:
        percent = 0.0
    return jsonify({"percent": percent})


@settings_bp.route("/api/settings/checkout_discount", methods=["PUT"])
def set_checkout_discount():
    """
    Set the checkout discount percent.
    Accepts JSON body: { "percent": 10 }.
    Returns: { "success": True, "percent": 10 }
    """
    try:
        data = request.get_json(silent=True) or {}
    except Exception:
        data = {}
    try:
        percent = float(data.get("percent", 0))
    except Exception:
        percent = 0.0

    # Persist temporarily in app.config. Replace with DB for production.
    current_app.config["CHECKOUT_DISCOUNT"] = {"percent": percent}
    return jsonify({"success": True, "percent": percent})
