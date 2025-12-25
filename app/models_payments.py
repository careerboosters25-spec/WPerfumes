from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from . import db  # assumes your package-level db = SQLAlchemy() in app/__init__.py


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(64), unique=True,
                             index=True, nullable=False)
    customer_name = db.Column(db.String(255))
    customer_email = db.Column(db.String(255))
    customer_phone = db.Column(db.String(60))
    customer_address = db.Column(db.Text)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0.00)
    currency = db.Column(db.String(8), nullable=False, default="USD")
    # pending, paid, cancelled, refunded
    status = db.Column(db.String(40), nullable=False, default="pending")
    created_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    # relationship to payments
    payments = db.relationship("Payment", backref="order", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Order id={self.id} order_number={self.order_number} status={self.status}>"


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey(
        "orders.id"), nullable=True, index=True)
    # 'paypal', 'stripe', etc.
    provider = db.Column(db.String(50), nullable=False, default="paypal")
    provider_order_id = db.Column(
        db.String(128), index=True)   # PayPal order id
    provider_capture_id = db.Column(
        db.String(128), index=True)  # PayPal capture id
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0.00)
    currency = db.Column(db.String(8), nullable=False, default="USD")
    # created, completed, failed, refunded
    status = db.Column(db.String(40), nullable=False, default="created")
    payer_name = db.Column(db.String(255))
    payer_email = db.Column(db.String(255))
    payer_id = db.Column(db.String(128))
    # store full capture/response JSON for audits
    raw_response = db.Column(db.JSON)
    created_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    def amount_decimal(self) -> Decimal:
        try:
            return Decimal(str(self.amount or "0"))
        except Exception:
            return Decimal("0")

    def __repr__(self) -> str:
        return f"<Payment id={self.id} provider={self.provider} amount={self.amount} status={self.status}>"


class PayPalWebhookEvent(db.Model):
    __tablename__ = "paypal_webhook_events"

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(128), index=True, nullable=False)
    event_type = db.Column(db.String(128), index=True)
    raw_event = db.Column(db.JSON)
    headers = db.Column(db.JSON)
    received_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PayPalWebhookEvent id={self.id} event_id={self.event_id} type={self.event_type}>"


# -------------------------
# Payments Admin users (top-management accounts)
# -------------------------
class PaymentsAdminUser(db.Model):
    """
    Stores top-management users authorized to use the payments admin panel.
    Passwords are stored hashed (werkzeug.generate_password_hash).
    Roles: CEO, Chairman, CFO (enforced when logging into payments-admin).
    """
    __tablename__ = "payments_admin_users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True,
                         nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(64), nullable=False)  # CEO, Chairman, CFO
    created_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PaymentsAdminUser id={self.id} username={self.username} role={self.role}>"
