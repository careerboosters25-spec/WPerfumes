#!/usr/bin/env bash
set -uo pipefail

if [ -z "${NEW_DSN:-}" ]; then
  echo "ERROR: NEW_DSN not set. Export NEW_DSN and PGPASSWORD before running."
  exit 2
fi

echo "Fixing sequences with MAX=0 by setting them to a valid start value..."

psql "$NEW_DSN" -At -F '|' -c "
SELECT
  nsp.nspname || '.' || seq.relname AS sequence_full,
  tab.relname AS table_name,
  attr.attname AS column_name,
  format('%s.%s', nsp.nspname, seq.relname) AS seq_qualified
FROM pg_class seq
JOIN pg_namespace nsp ON seq.relnamespace = nsp.oid
JOIN pg_depend dep ON dep.objid = seq.oid
JOIN pg_class tab ON dep.refobjid = tab.oid
JOIN pg_attribute attr ON attr.attrelid = tab.oid AND attr.attnum = dep.refobjsubid
WHERE seq.relkind = 'S';
" | while IFS='|' read -r sequence_full table_name column_name seq_qualified; do

  # defensive
  if [ -z "$sequence_full" ] || [ -z "$table_name" ] || [ -z "$column_name" ] || [ -z "$seq_qualified" ]; then
    continue
  fi

  echo "Processing: $sequence_full -> $table_name.$column_name"

  # get numeric max of the table column
  maxval=$(psql "$NEW_DSN" -At -c "SELECT COALESCE(MAX(\"$column_name\"),0) FROM public.\"$table_name\";" 2>/dev/null || echo "0")
  if [ -z "$maxval" ]; then maxval=0; fi

  if [ "$maxval" -gt 0 ] 2>/dev/null; then
    echo "  max=$maxval -> setting sequence to $maxval (is_called=true)"
    psql "$NEW_DSN" -c "SELECT setval('${seq_qualified}', ${maxval}, true);" || echo "  ERROR setting ${seq_qualified} to ${maxval}"
  else
    # empty table: find the sequence min_value from pg_sequences if available
    seq_name="${seq_qualified#*.}"
    minval=$(psql "$NEW_DSN" -At -c "SELECT min_value FROM pg_sequences WHERE schemaname='public' AND sequencename='${seq_name}';" 2>/dev/null || echo "")
    if [ -z "$minval" ]; then
      minval=1
    fi
    # ensure minval is at least 1
    if [ "$minval" -lt 1 ] 2>/dev/null; then
      start=1
    else
      start=$minval
    fi
    echo "  max=0 -> table empty. Setting sequence to start=${start} (is_called=false) so nextval returns ${start}"
    psql "$NEW_DSN" -c "SELECT setval('${seq_qualified}', ${start}, false);" || echo "  ERROR setting ${seq_qualified} to ${start}"
  fi
done

echo "Done."
