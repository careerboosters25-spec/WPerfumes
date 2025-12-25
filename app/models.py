# app/models.py
from flask import current_app
from . import db
from datetime import datetime


class Brand(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, unique=True, nullable=False)
    description = db.Column(db.String)

    @property
    def logo_url(self):
        """
        Returns the storage path used by the frontend.
        The routes layer will normalize this into a browser-ready /static/... URL.
        """
        folder = self.name.lower().replace(" ", "_").replace("'", "")
        filename = folder + ".jpg"
        return f"images/{folder}/{filename}"


class Product(db.Model):
    id = db.Column(db.String, primary_key=True)
    brand = db.Column(db.String, db.ForeignKey('brand.name'))
    title = db.Column(db.String)
    price = db.Column(db.Float)
    description = db.Column(db.String)
    keyNotes = db.Column(db.String)
    image_url = db.Column(db.String)
    thumbnails = db.Column(db.String)
    status = db.Column(db.String)
    quantity = db.Column(db.Integer, default=10)
    tags = db.Column(db.String)

    @property
    def image_url_dynamic(self):
        """
        If image_url is set return it; otherwise construct a predictable path
        based on brand/title. The routes layer will prefix /static/ when returning to client.
        """
        if self.image_url:
            return self.image_url
        if not self.brand or not self.title:
            return ""
        brand_folder = self.brand.lower().replace(" ", "_").replace("'", "")
        product_file = self.title.lower().replace(" ", "_").replace("'", "") + ".jpg"
        return f"images/{brand_folder}/{product_file}"


class HomepageProduct(db.Model):
    homepage_id = db.Column(db.Integer, primary_key=True)
    section = db.Column(db.String, nullable=False)
    product_id = db.Column(db.String, db.ForeignKey(
        'product.id'), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    visible = db.Column(db.Boolean, default=True)


class Coupon(db.Model):
    code = db.Column(db.String, primary_key=True)
    description = db.Column(db.String)
    discount_type = db.Column(db.String)
    discount_value = db.Column(db.Float)
    start_date = db.Column(db.String)
    end_date = db.Column(db.String)
    active = db.Column(db.Boolean, default=True)


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String, nullable=False)
    customer_email = db.Column(db.String, nullable=False)
    customer_phone = db.Column(db.String, nullable=False)
    customer_address = db.Column(db.String, nullable=False)
    product_id = db.Column(db.String, db.ForeignKey('product.id'))
    product_title = db.Column(db.String)
    quantity = db.Column(db.Integer, default=1)
    status = db.Column(db.String, default="Pending")
    payment_method = db.Column(db.String, default="Cash on Delivery")
    # keep date as string for simplicity with existing seed data
    date = db.Column(
        db.String, default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


class OrderAttempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String)
    product = db.Column(db.String)
    qty = db.Column(db.Integer)
    status = db.Column(db.String)
    timestamp = db.Column(
        db.String, default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


# -------------------------
# New Setting model
# -------------------------
class Setting(db.Model):
    """
    Simple key/value table for site-wide settings.
    key: short string used as primary key (e.g. 'checkout_discount')
    value: stored as text (we store numeric percent as string here)
    """
    __tablename__ = "setting"
    key = db.Column(db.String(64), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Setting {self.key}={self.value}>"


# -------------------------
# Story model for content backend (updated with 'section' and 'position')
# -------------------------
class Story(db.Model):
    """
    Stories / content entries for the content pages.

    Fields:
      - id: primary key
      - title: human-friendly title
      - slug: URL-friendly unique slug used by /story/<slug> and /content-api/pages/<slug>
      - section: optional grouping (e.g. 'history', 'about')
      - excerpt: short summary used in lists
      - body_html: HTML content stored as text (produced by the WYSIWYG editor)
      - author: author name
      - featured_image: stored path (uploads/content/...), or absolute URL
      - published: boolean flag for public visibility
      - published_at: datetime when published (set when publishing)
      - position: integer used for manual prominence ordering (higher values appear first)
      - created_at / updated_at
    """
    __tablename__ = "story"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    slug = db.Column(db.String(255), unique=True, nullable=False)
    section = db.Column(db.String(64), nullable=True)
    excerpt = db.Column(db.Text, nullable=True)
    body_html = db.Column(db.Text, nullable=True)
    author = db.Column(db.String(120), nullable=True)
    # stored relative path like 'uploads/content/filename.jpg' or absolute URL
    featured_image = db.Column(db.String, nullable=True)
    published = db.Column(db.Boolean, default=False)
    published_at = db.Column(db.DateTime, nullable=True)
    position = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_public_dict(self):
        """
        Return the public-facing JSON representation used by the content API.
        Normalize featured_image to a browser URL.
        """
        img_url = None
        if self.featured_image:
            # featured_image may be an absolute URL, a root-relative URL, or a stored relative path.
            if isinstance(self.featured_image, str):
                if self.featured_image.startswith("http://") or self.featured_image.startswith("https://"):
                    img_url = self.featured_image
                elif self.featured_image.startswith("/"):
                    img_url = self.featured_image
                else:
                    img_url = f"/static/{self.featured_image.lstrip('/')}"
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "section": self.section or "",
            "excerpt": self.excerpt or "",
            "body_html": self.body_html or "",
            "author": self.author or "",
            "featured_image": img_url,
            "published": bool(self.published),
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "position": int(self.position or 0),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<Story {self.id} {self.slug} section={self.section} published={self.published} pos={self.position}>"


def seed_data():
    # Avoid duplicate seeding
    if Brand.query.count() == 0:
        brands = [
            Brand(name="Creed", description="A legacy of over 250 years, crafting original fragrances for royal houses and discerning tastes."),
            Brand(name="Clive Christian",
                  description="British luxury perfume house."),
            Brand(name="Amouage", description="Iconic Omani fragrance house."),
            Brand(name="Tom Ford", description=""),
            Brand(name="Penhaligon's", description=""),
            Brand(name="Xerjoff", description=""),
            Brand(name="Emporio Armani", description=""),
        ]
        db.session.bulk_save_objects(brands)
        db.session.commit()
    if Product.query.count() == 0:
        products = [
            Product(
                id="PRD001", brand="Creed", title="Aventus", price=350.00,
                description="The iconic, best-selling men's fragrance by Creed. A sophisticated blend for the discerning individual, celebrating strength and success.",
                keyNotes="Top: Pineapple, Blackcurrant, Bergamot;Heart: Moroccan Jasmine, Birch, Patchouli;Base: Musk, Oakmoss, Ambergris",
                image_url="images/creed/aventus.jpg",
                thumbnails="images/creed/aventus.jpg,images/creed/aventus_side.jpg,images/creed/aventus_box.jpg",
                status="restocked", quantity=10, tags="gym,active,masculine,fruity,sport"
            ),
            Product(
                id="PRD002", brand="Creed", title="Himalaya", price=280.00,
                description="Inspired by the rugged beauty and serenity of the Tibetan mountains.",
                keyNotes="Top: Bergamot, Grapefruit, Lemon;Heart: Sandalwood, Juniper Berries;Base: Musk, Ambergris, Cedarwood",
                image_url="images/creed/himalaya.jpg",
                thumbnails="images/creed/himalaya.jpg,images/creed/himalaya_side.jpg,images/creed/himalaya_box.jpg",
                status="restocked", quantity=10, tags="active,fresh,sport,mountain,outdoor"
            ),
            Product(
                id="PRD003", brand="Creed", title="Aventus for Her", price=330.00,
                description="The feminine counterpart to the legendary Aventus.",
                keyNotes="Top: Green Apple, Violet, Pink Peppercorn;Heart: Rose, Styrax, Sandalwood;Base: Peach, Amber, Ylang-Ylang",
                image_url="images/creed/aventus_for_her.jpg",
                thumbnails="images/creed/aventus_for_her.jpg,images/creed/aventus_for_her_side.jpg,images/creed/aventus_for_her_box.jpg",
                status="restocked", quantity=10, tags="fruity,feminine,confident"
            ),
        ]
        db.session.bulk_save_objects(products)
        db.session.commit()
    if HomepageProduct.query.count() == 0:
        homepage_products = [
            HomepageProduct(section="signature",
                            product_id="PRD001", sort_order=1, visible=True),
            HomepageProduct(section="men", product_id="PRD002",
                            sort_order=2, visible=True),
            HomepageProduct(section="women", product_id="PRD003",
                            sort_order=3, visible=True),
        ]
        db.session.bulk_save_objects(homepage_products)
        db.session.commit()
    if Coupon.query.count() == 0:
        coupons = [
            Coupon(
                code="WELCOME10",
                description="10% off for new customers",
                discount_type="percent",
                discount_value=10.0,
                start_date="2025-09-01",
                end_date="2025-12-31",
                active=True
            ),
            Coupon(
                code="FALLSALE25",
                description="25 USD off Fall Sale",
                discount_type="fixed",
                discount_value=25.0,
                start_date="2025-09-15",
                end_date="2025-10-15",
                active=True
            ),
        ]
        db.session.bulk_save_objects(coupons)
        db.session.commit()
    if Order.query.count() == 0:
        orders = [
            Order(
                customer_name="John Doe",
                customer_email="john.doe@example.com",
                customer_phone="1234567890",
                customer_address="123 Main Street, New York",
                product_id="PRD001",
                product_title="Aventus",
                quantity=2,
                status="Pending",
                payment_method="Cash on Delivery",
                date=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
            Order(
                customer_name="Jane Smith",
                customer_email="jane.smith@example.com",
                customer_phone="9876543210",
                customer_address="456 Park Ave, London",
                product_id="PRD003",
                product_title="Aventus for Her",
                quantity=1,
                status="Delivered",
                payment_method="Card",
                date=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
        ]
        db.session.bulk_save_objects(orders)
        db.session.commit()
