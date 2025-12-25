from app import create_app
from app.models import Product, Story
app = create_app()
with app.app_context():
    bad_products = Product.query.filter(Product.image_url.like('/static/%')).order_by(Product.id).all()
    print("Products with leading /static/ (count):", len(bad_products))
    for p in bad_products[:50]:
        print("P:", p.id, "->", p.image_url)
    bad_stories = Story.query.filter(Story.featured_image.like('/static/%')).order_by(Story.id).all()
    print("Stories with leading /static/ (count):", len(bad_stories))
    for s in bad_stories[:20]:
        print("S:", s.id, "->", s.featured_image)
