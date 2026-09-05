#!/bin/bash
# Instalarea Curierului Xel'Naga pe VM-ul Azure, langa Radio Xel'Naga.
# Se ruleaza ca root, prin portal -> VM -> Run command, dupa git clone (sau il face el).
set -euo pipefail

DIR=/opt/curier-xelnaga

echo "== node =="
node --version || { echo "node lipseste"; exit 1; }

echo "== utilizator =="
id curier >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin curier

echo "== fisiere =="
if [ ! -d "$DIR/src" ]; then
  git clone https://github.com/starcraftromania/curier-xelnaga.git "$DIR"
fi
mkdir -p "$DIR/date"

echo "== .env =="
if [ ! -f "$DIR/.env" ]; then
  cp "$DIR/.env.exemplu" "$DIR/.env"
  echo "ATENTIE: .env e gol - pune DISCORD_TOKEN inainte de pornire"
fi

echo "== dependinte =="
cd "$DIR"
npm install --omit=dev --no-audit --no-fund

echo "== teste =="
node test/ruleaza.js || echo "ATENTIE: testele au picat"

echo "== drepturi =="
chown -R curier:curier "$DIR"
chmod 600 "$DIR/.env"

echo "== systemd =="
cp "$DIR/curier-xelnaga.service" /etc/systemd/system/curier-xelnaga.service
systemctl daemon-reload
systemctl enable curier-xelnaga

if grep -q '^DISCORD_TOKEN=.\+' "$DIR/.env"; then
  systemctl restart curier-xelnaga
  sleep 8
  systemctl is-active curier-xelnaga
  journalctl -u curier-xelnaga -n 20 --no-pager
else
  echo "NU pornesc serviciul: DISCORD_TOKEN lipseste din $DIR/.env"
fi

echo "== gata =="
