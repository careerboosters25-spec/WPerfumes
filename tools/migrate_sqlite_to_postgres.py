#!/usr/bin/env python3
"""
migrate_sqlite_to_postgres.py

Improved migration helper:
- copies data from a local SQLite DB (default instance/database.db) into a Postgres DB
  pointed to by the DATABASE_URL env var.
- ignores extra columns that do not exist in the target Postgres table
- processes tables in dependency order inferred from Postgres foreign keys
- attempts to sanitize rows that violate foreign keys by nulling the offending FK and re-inserting
- prints problematic rows that still fail so you can inspect/correct them manually

Usage:
  export DATABASE_URL='postgresql://user:pass@host:port/dbname'
  python tools/migrate_sqlite_to_postgres.py [path/to/instance/database.db]
"""
import os
import sys
import traceback
from sqlalchemy import create_engine, MetaData, Table, select
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
try:
    from sqlalchemy.dialects.postgresql import insert as pg_insert
except Exception:
    pg_insert = None


def match_pg_table_name(sqlite_name, pg_metadata):
    # Try common name matches: exact, lower, replace dashes, underscores
    candidates = list(pg_metadata.tables.keys())
    sqlite_norm = sqlite_name.lower().replace('-', '_')
    for c in candidates:
        if c.lower() == sqlite_name.lower():
            return pg_metadata.tables[c]
    for c in candidates:
        if c.lower() == sqlite_norm:
            return pg_metadata.tables[c]
    # fallback: return None
    return None


def build_dependency_order(pg_meta):
    # Build simple dependency graph using reflected foreign keys
    deps = {t.name: set() for t in pg_meta.sorted_tables}
    for t in pg_meta.sorted_tables:
        for fk in t.foreign_keys:
            ref_table = fk.column.table.name
            deps[t.name].add(ref_table)
    # topological sort
    order = []
    temp = {k: set(v) for k, v in deps.items()}
    while temp:
        acyclic = False
        for node, parents in list(temp.items()):
            if not parents:
                acyclic = True
                order.append(node)
                temp.pop(node)
                for other in temp:
                    if node in temp[other]:
                        temp[other].remove(node)
                break
        if not acyclic:
            # cycle detected — fallback to metadata order
            return [t.name for t in pg_meta.sorted_tables]
    return order


def sanitize_row_for_fk(row, pg_table, pg_conn):
    """
    For each FK on pg_table, if the row's value for that FK column does not refer to existing row
    in the referenced table, set it to None (NULL) to avoid FK violation.
    Returns (sanitized_row, changed_flag, problems_list)
    """
    changed = False
    problems = []
    new_row = dict(row)
    for fk in pg_table.foreign_keys:
        parent_col = fk.parent.name  # column name in this table that is FK
        ref_table = fk.column.table.name
        ref_col = fk.column.name
        if parent_col not in new_row:
            continue
        val = new_row[parent_col]
        # treat empty string, '0', 0 as missing
        if val is None or (isinstance(val, (int, float)) and int(val) == 0) or (isinstance(val, str) and val.strip() in ("", "0")):
            if new_row[parent_col] is not None:
                new_row[parent_col] = None
                changed = True
            continue
        # check existence in referenced table
        try:
            check_stmt = select([fk.column.table.c[ref_col]]).where(
                fk.column.table.c[ref_col] == val).limit(1)
            res = pg_conn.execute(check_stmt).first()
            if not res:
                # missing parent, null the FK
                problems.append((parent_col, ref_table, val))
                new_row[parent_col] = None
                changed = True
        except Exception:
            # if check fails, skip checking
            pass
    return new_row, changed, problems


def main():
    sqlite_path = sys.argv[1] if len(sys.argv) > 1 else "instance/database.db"
    if not os.path.exists(sqlite_path):
        print(f"ERROR: sqlite file not found at {sqlite_path}")
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.")
        sys.exit(1)

    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}")
    pg_engine = create_engine(database_url)

    meta_sqlite = MetaData()
    meta_pg = MetaData()

    print("Reflecting SQLite metadata...")
    meta_sqlite.reflect(bind=sqlite_engine)
    print("Reflecting Postgres metadata...")
    meta_pg.reflect(bind=pg_engine)

    # Determine safe table processing order for Postgres
    pg_order = build_dependency_order(meta_pg)
    print("Planned Postgres table processing order (parents first):")
    print(pg_order)

    # Map sqlite table names to postgres table objects (if possible)
    sqlite_table_names = list(meta_sqlite.tables.keys())

    # Create a mapping: sqlite_name -> pg_table (or None)
    mapping = {}
    for sname in sqlite_table_names:
        pg_table = match_pg_table_name(sname, meta_pg)
        mapping[sname] = pg_table
        if pg_table is None:
            print(
                f"Warning: no matching target Postgres table found for sqlite table '{sname}' — skipping.")

    # We'll process tables in the PG dependency order, but only for tables that exist in sqlite as well.
    process_list = [t for t in pg_order if any(
        k.lower() == t.lower() for k in sqlite_table_names)]
    # ensure any sqlite-only tables at end are also processed (if they matched)
    for s in sqlite_table_names:
        pgtable = mapping.get(s)
        if pgtable and pgtable.name not in process_list:
            process_list.append(pgtable.name)

    print("Final table processing sequence:")
    print(process_list)

    with sqlite_engine.connect() as sconn, pg_engine.connect() as pconn:
        for tbl_name in process_list:
            # find sqlite table name corresponding to this pg table (case-insensitive)
            sqlite_name = None
            for s in sqlite_table_names:
                if s.lower() == tbl_name.lower():
                    sqlite_name = s
                    break
            if sqlite_name is None:
                print(f"Skipping {tbl_name}: not present in sqlite source.")
                continue

            sqlite_table = meta_sqlite.tables[sqlite_name]
            pg_table = meta_pg.tables.get(tbl_name)
            if pg_table is None:
                print(f"Skipping {sqlite_name}: no target pg table match.")
                continue

            print(f"\nProcessing table {sqlite_name} -> {pg_table.name}")
            try:
                rows = sconn.execute(select(sqlite_table)).mappings().all()
            except Exception as e:
                print(
                    f"  ERROR: failed to read from sqlite table {sqlite_name}: {e}")
                continue

            if not rows:
                print(f"  -> No rows found in sqlite for '{sqlite_name}'.")
                continue

            # Filter each row to include only columns present in pg_table
            pg_columns = [c.name for c in pg_table.columns]
            filtered_rows = []
            for r in rows:
                try:
                    rd = dict(r)
                except Exception:
                    rd = {}
                    for c in sqlite_table.c:
                        rd[c.name] = r[c]
                # keep only pg columns
                row_filtered = {k: v for k, v in rd.items() if k in pg_columns}
                # sanitize types: convert '' -> None for nullable fields
                for k, v in list(row_filtered.items()):
                    if isinstance(v, str) and v.strip() == "":
                        row_filtered[k] = None
                filtered_rows.append(row_filtered)

            print(
                f"  -> {len(filtered_rows)} rows read from sqlite; columns will be limited to {len(pg_columns)} target columns.")

            # Try bulk upsert/insert
            migrated = False
            if pg_insert is not None:
                try:
                    pk_cols = [c.name for c in pg_table.primary_key]
                    stmt = pg_insert(pg_table).values(filtered_rows)
                    if pk_cols:
                        update_cols = {
                            c.name: stmt.excluded[c.name] for c in pg_table.columns if c.name not in pk_cols}
                        if update_cols:
                            stmt = stmt.on_conflict_do_update(
                                index_elements=pk_cols, set_=update_cols)
                        else:
                            stmt = stmt.on_conflict_do_nothing(
                                index_elements=pk_cols)
                    pconn.execute(stmt)
                    pconn.commit()
                    print(
                        f"  -> Bulk upsert to Postgres attempted for {pg_table.name}.")
                    migrated = True
                except Exception as e:
                    print(
                        f"  WARNING: bulk upsert failed for table '{pg_table.name}': {e}")
                    # fall through to more robust per-row attempts

            if not migrated:
                # fallback: attempt per-row insertion with FK sanitation
                skipped_rows = []
                inserted = 0
                for r in filtered_rows:
                    # try to insert directly
                    try:
                        pconn.execute(pg_table.insert(), r)
                        inserted += 1
                        continue
                    except IntegrityError as ie:
                        # likely FK or PK violation: try sanitizing FKs
                        pconn.rollback()
                        try:
                            new_r, changed, problems = sanitize_row_for_fk(
                                r, pg_table, pconn)
                            if changed:
                                try:
                                    pconn.execute(pg_table.insert(), new_r)
                                    inserted += 1
                                    continue
                                except IntegrityError as ie2:
                                    pconn.rollback()
                                    skipped_rows.append((r, str(ie2)))
                                except Exception as e2:
                                    pconn.rollback()
                                    skipped_rows.append((r, str(e2)))
                            else:
                                skipped_rows.append((r, str(ie)))
                        except Exception as se:
                            pconn.rollback()
                            skipped_rows.append((r, f"Sanitize failed: {se}"))
                    except SQLAlchemyError as sqe:
                        pconn.rollback()
                        skipped_rows.append((r, str(sqe)))
                    except Exception as e:
                        pconn.rollback()
                        skipped_rows.append((r, str(e)))

                try:
                    pconn.commit()
                except Exception:
                    pconn.rollback()

                print(
                    f"  -> Per-row insert attempted: {inserted} rows inserted, {len(skipped_rows)} rows skipped.")
                if skipped_rows:
                    print("  -> Listing a few skipped rows (row dict, error):")
                    for idx, (row, err) in enumerate(skipped_rows[:10]):
                        print(f"     SKIPPED[{idx}]: {row}  -->  {err}")

    print("\nMigration complete. Inspect logs above for skipped rows. You may need to correct source sqlite data or insert missing parent rows (e.g. Product) before re-running for perfect migration.")
    print("If you need to re-run, fix the sqlite data (or let the script skip problematic rows) and run again.")


if __name__ == "__main__":
    main()
