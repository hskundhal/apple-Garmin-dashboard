#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# Kill any existing servers on :8001 and :5173
lsof -ti:8001 -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

echo "▶ Starting FastAPI backend on :8001..."
cd "$ROOT" && .venv/bin/uvicorn backend.server:app --host 0.0.0.0 --port 8001 --reload &

echo "▶ Starting Vite frontend on :5173..."
cd "$ROOT/frontend" && npm run dev &

echo ""
echo "✓ Dashboard running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8001"
echo ""
wait
