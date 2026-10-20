#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=8000
command -v python3 >/dev/null 2>&1 && PY=python3 || PY=python
echo "正在启动本地服务器 http://localhost:$PORT/ （Ctrl+C 停止）"
sleep 1
(command -v xdg-open >/dev/null 2>&1 && xdg-open "http://localhost:$PORT/") || (command -v open >/dev/null 2>&1 && open "http://localhost:$PORT/") || true
"$PY" -m http.server $PORT
