-- scripts/init_product_codes.sql
-- Create product_code sequence/table, backfill existing products, and triggers
-- Run with: psql "$DATABASE_URL" -f scripts/init_product_codes.sql

BEGIN;

-- 1) sequence (if you prefer a separate sequence; product_code.num uses nextval)
CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;

-- 2) product_code table
-- 'num' is the sequence-generated numeric id. 'code' is generated from num.
-- Postgres GENERATED ALWAYS AS ... STORED requires Postgres >= 12.
CREATE TABLE IF NOT EXISTS product_code (
  num bigint NOT NULL DEFAULT nextval('product_code_seq'),
  code text GENERATED ALWAYS AS ('PRD' || lpad(num::text, 4, '0')) STORED,
  product_id text NULL,       -- references product.id (nullable)
  product_name text NULL,     -- snapshot of product title at assignment
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (num)
);

-- Ensure uniqueness of code (should be implicit via num -> code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_code_code ON product_code(code);

-- 3) ensure product table has a code column (nullable for now)
ALTER TABLE product ADD COLUMN IF NOT EXISTS code text;

-- 4) Back up existing mapping (safety)
CREATE TABLE IF NOT EXISTS product_code_backup AS TABLE product_code WITH NO DATA;
-- copy any existing code values (if somehow present)
INSERT INTO product_code_backup (num, code, product_id, product_name, assigned_at)
SELECT num, code, product_id, product_name, assigned_at FROM product_code;

-- 5) Backfill: for any product rows that do not have a code, allocate codes in a deterministic order
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
BEGIN
  FOR rec IN SELECT id, title FROM product WHERE COALESCE(code,'') = '' ORDER BY id LOOP
    INSERT INTO product_code (product_id, product_name) VALUES (rec.id, rec.title) RETURNING code INTO new_code;
    UPDATE product SET code = new_code WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6) Create trigger to auto-assign a code on new product inserts if code is not provided
CREATE OR REPLACE FUNCTION assign_product_code() RETURNS trigger AS $$
DECLARE
  c text;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    INSERT INTO product_code(product_id, product_name) VALUES (NEW.id, COALESCE(NEW.title, '')) RETURNING code INTO c;
    NEW.code := c;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_product_code ON product;
CREATE TRIGGER trg_assign_product_code
BEFORE INSERT ON product
FOR EACH ROW
EXECUTE FUNCTION assign_product_code();

-- 7) Keep product_code rows reserved when product removed: unlink product_id on delete
CREATE OR REPLACE FUNCTION unlink_product_code_on_delete() RETURNS trigger AS $$
BEGIN
  UPDATE product_code SET product_id = NULL WHERE product_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unlink_product_code ON product;
CREATE TRIGGER trg_unlink_product_code
AFTER DELETE ON product
FOR EACH ROW
EXECUTE FUNCTION unlink_product_code_on_delete();

-- 8) Keep product_name updated if product title changes
CREATE OR REPLACE FUNCTION update_product_code_name_on_update() RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE product_code SET product_name = NEW.title WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_product_code_name ON product;
CREATE TRIGGER trg_update_product_code_name
AFTER UPDATE ON product
FOR EACH ROW
EXECUTE FUNCTION update_product_code_name_on_update();

-- 9) Make product.code unique and not null (only after backfill)
-- First ensure no duplicates (should not happen). Then create unique index and set NOT NULL.
-- Use IF NOT EXISTS style for index
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_code_on_product ON product(code);

-- Set NOT NULL only when every row has a code
DO $$
DECLARE cnt INT;
BEGIN
  SELECT count(*) INTO cnt FROM product WHERE code IS NULL OR code = '';
  IF cnt = 0 THEN
    ALTER TABLE product ALTER COLUMN code SET NOT NULL;
  ELSE
    RAISE NOTICE 'product.code not set for % rows; NOT NULL not applied', cnt;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;