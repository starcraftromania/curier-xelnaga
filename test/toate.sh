#!/bin/bash
# Ruleaza toate testele. Iese cu cod != 0 daca vreunul pica.
cd "$(dirname "$0")/.." || exit 1
rc=0
for t in test/ruleaza.js test/*.test.js; do
  out=$(node "$t" 2>&1); r=$?
  echo "$(basename "$t"): $(echo "$out" | tail -1)"
  [ $r -ne 0 ] && { rc=1; echo "$out" | grep PICAT; }
done
exit $rc
