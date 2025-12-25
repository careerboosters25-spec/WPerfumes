#!/usr/bin/env bash
# safe sequence sync: sets numeric sequences to MAX(column)
# Usage: export NEW_DSN and PGPASSWORD, then: bash sync_sequences_safe.sh

# Don't exit on first error so you can inspect all operations
set -uo pipefail

if [ -z "${NEW_DSN:-}" ]; then
  echo "ERROR: NEW_DSN not set. Export NEW_DSN before running."
  exit 2
fi

TMPFILE="$(mktemp -t sequences.XXXXXX 2>/dev/null || mktemp)"
echo "Fetching sequences..."
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
" > "$TMPFILE" 2>/tmp/psql_seq_err.log

if [ ! -s "$TMPFILE" ]; then
  echo "No sequences found or query returned no rows. See /tmp/psql_seq_err.log for details."
  cat /tmp/psql_seq_err.log 2>/dev/null || true
  rm -f "$TMPFILE"
  exit 0
fi

echo "Sequences to process:"
cat "$TMPFILE"
echo

while IFS='|' read -r sequence_full table_name column_name seq_qualified; do
  # defensive checks
  if [ -z "$sequence_full" ] || [ -z "$table_name" ] || [ -z "$column_name" ] || [ -z "$seq_qualified" ]; then
    echo "Skipping malformed line: $sequence_full | $table_name | $column_name | $seq_qualified"
    continue
  fi

  # get column type
  coltype=$(psql "$NEW_DSN" -At -c "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${table_name}' AND column_name='${column_name}';" 2>/dev/null || echo "unknown")
  echo "Sequence: $sequence_full -> ${table_name}.${column_name} (type: ${coltype:-unknown})"

  case "$coltype" in
    integer|bigint|smallint|numeric)
      maxval=$(psql "$NEW_DSN" -At -c "SELECT COALESCE(MAX(\"$column_name\"),0) FROM public.\"$table_name\";" 2>/tmp/psql_max_err.log) || maxval=""
      if [ -z "$maxval" ]; then
        echo "  Warning: failed to read MAX for ${table_name}.${column_name}. See /tmp/psql_max_err.log"
        cat /tmp/psql_max_err.log 2>/dev/null || true
        continue
      fi
      echo "  Setting $sequence_full to $maxval"
      psql "$NEW_DSN" -c "SELECT setval('${seq_qualified}', ${maxval}, true);" 2>/tmp/psql_setval_err.log
      if [ -s /tmp/psql_setval_err.log ]; then
        echo "  ERROR setting sequence $sequence_full. See /tmp/psql_setval_err.log"
        cat /tmp/psql_setval_err.log 2>/dev/null || true
      else
        echo "  OK"
      fi
      ;;
    *)
      echo "  Skipping (non-numeric column type: '$coltype')"
      ;;
  esac
done < "$TMPFILE"

rm -f "$TMPFILE" /tmp/psql_seq_err.log /tmp/psql_max_err.log /tmp/psql_setval_err.log
echo "Done."
