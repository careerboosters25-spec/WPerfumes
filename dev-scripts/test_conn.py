import os, sys
import psycopg2
dsn = os.environ.get("DATABASE_URL") or "postgresql://wperfumes_hfdk_user:7zfVME5Jn9Unb3mPgUwMchsvIzZAn5nY@dpg-d55932i4d50c739q8000-a.oregon-postgres.render.com/wperfumes_hfdk?sslmode=require"
print("Testing DSN:", dsn)
try:
    conn = psycopg2.connect(dsn, connect_timeout=10)
    cur = conn.cursor()
    cur.execute("SELECT version(), current_database(), current_user;")
    print("SELECT ->", cur.fetchone())
    cur.close()
    conn.close()
    print("Connection OK")
except Exception as e:
    print("ERROR:", type(e).__name__, str(e))
    sys.exit(2)
