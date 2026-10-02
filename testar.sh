#!/usr/bin/env bash
# Guia Visão — abrir para testar (localhost = contexto seguro p/ câmera + SW)
# Uso: bash testar.sh
set -e
PORT="${1:-8130}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# libera a porta se já houver servidor nosso (via PID file, sem pkill)
if [ -f /tmp/opencode/guia-visao-serve.pid ] && kill -0 "$(cat /tmp/opencode/guia-visao-serve.pid)" 2>/dev/null; then kill "$(cat /tmp/opencode/guia-visao-serve.pid)"; sleep 1; fi
cd "$DIR"
python3 -m http.server "$PORT" >/tmp/opencode/guia-visao-serve.log 2>&1 &
SRV=$!
echo "$SRV" > /tmp/opencode/guia-visao-serve.pid
sleep 1
URL="http://localhost:$PORT/index.html"
echo "Servindo em $URL (PID $SRV, log /tmp/opencode/guia-visao-serve.log)"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" & fi
echo "No CELULAR (mesmo Wi-Fi, câmera exige HTTPS):"
echo "  npx --yes cloudflared tunnel --url http://localhost:$PORT"
echo "  → abra a URL https gerada no Chrome do celular."
echo "Para parar: kill $SRV"
