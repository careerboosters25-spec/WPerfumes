from app import create_app
app = create_app()
with app.app_context():
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        methods = ','.join(sorted([m for m in rule.methods if m not in ('HEAD','OPTIONS')]))
        print(f"{rule.rule:40}  -> endpoint={rule.endpoint:40}  methods={methods}")
