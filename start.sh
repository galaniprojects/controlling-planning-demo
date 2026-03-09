#!/bin/bash
# CRETA Demo App — Start Script
# Launches both backend (port 8000) and frontend (port 5173)
# Usage: ./start.sh

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting CRETA Demo App...${NC}"

# Start backend
echo -e "${GREEN}[1/3] Starting backend (FastAPI on port 8000)...${NC}"
cd "$DIR/backend"
source .venv/bin/activate
python main.py &
BACKEND_PID=$!

# Wait for backend to be ready
for i in {1..15}; do
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}      Backend ready.${NC}"
    break
  fi
  sleep 1
done

# Reset demo data
echo -e "${GREEN}[2/3] Resetting demo data...${NC}"
curl -s -X POST http://localhost:8000/api/admin/reset-demo | python -m json.tool

# Start frontend
echo -e "${GREEN}[3/3] Starting frontend (Vite on port 5173)...${NC}"
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  CRETA Demo App is running${NC}"
echo -e "${BLUE}  Frontend:  http://localhost:5173${NC}"
echo -e "${BLUE}  Backend:   http://localhost:8000${NC}"
echo -e "${BLUE}  API Docs:  http://localhost:8000/docs${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM

wait
