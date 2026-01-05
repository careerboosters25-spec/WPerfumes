from django.apps import apps
from django.db import IntegrityError
import traceback, sys

app_label = "app"
try:
    Product = apps.get_model(app_label, "Product")
    Brand = apps.get_model(app_label, "Brand")
    print("Found models:", Product, Brand)
    print("Brands count:", Brand.objects.count())
    b = Brand.objects.first()
    print("First brand:", b)
    # Try to build minimal product — adjust field names if necessary
    sample_kwargs = {}
    # heuristics: try common fields
    for field in ["name","title","slug","price"]:
        try:
            f = Product._meta.get_field(field)
            if field == "price":
                sample_kwargs[field] = 1
            else:
                sample_kwargs[field] = "diag-test"
        except Exception:
            pass
    if "brand" in [f.name for f in Product._meta.get_fields()]:
        sample_kwargs["brand"] = b
    print("Attempting to create product with:", sample_kwargs)
    try:
        p = Product(**sample_kwargs)
        p.save()
        print("Created product id:", getattr(p, "pk", None))
    except Exception as e:
        traceback.print_exc()
except LookupError as e:
    print("LookupError:", e)
    traceback.print_exc()
except Exception:
    traceback.print_exc()
