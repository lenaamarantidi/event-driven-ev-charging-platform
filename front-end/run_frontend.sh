#!/bin/bash

# Frontend Run Script (Linux/macOS)
# Installs dependencies if needed and starts Vite dev server
# Usage: ./run_frontend.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR"
ROOT_ENV="$FRONTEND_DIR/../.env"

if [ -f "$ROOT_ENV" ]; then
    set -a
    . "$ROOT_ENV"
    set +a
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}EV Charger Frontend${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

# Step 1: Check Node.js & npm
echo -e "\n${BLUE}[1/2] Checking Node.js & npm...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}✗ Node.js not found${NC}"
    echo -e "${YELLOW}Please install Node.js (https://nodejs.org) and re-run.${NC}"
    exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}✗ npm not found${NC}"
    echo -e "${YELLOW}Please install npm (usually bundled with Node.js) and re-run.${NC}"
    exit 1
fi

NODE_VERSION="$(node -v)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
REQUIRED_NODE_MAJOR=18

if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
    echo -e "${RED}✗ Node.js version ${NODE_VERSION} is not supported${NC}"
    echo -e "${YELLOW}Please install Node.js ${REQUIRED_NODE_MAJOR}+ and re-run.${NC}"
    if [ -f "$FRONTEND_DIR/.nvmrc" ]; then
        echo -e "${YELLOW}Project recommends: $(cat "$FRONTEND_DIR/.nvmrc")${NC}"
    fi
    exit 1
fi

echo -e "${GREEN}✓ Node.js: ${NODE_VERSION}${NC}"
echo -e "${GREEN}✓ npm: $(npm -v)${NC}"

# Step 2: Ensure dependencies exist
echo -e "\n${BLUE}[2/2] Verifying dependencies...${NC}"
cd "$FRONTEND_DIR"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
        echo -e "${GREEN}✓ Dependencies installed${NC}"
        echo -e "${YELLOW}Frontend will be available at: http://localhost:5173${NC}"
else
    echo -e "${GREEN}✓ Dependencies present${NC}"
fi

# Start dev server
echo -e "\n${BLUE}Starting Vite dev server...${NC}"
echo -e "${GREEN}Open: http://localhost:5173${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

exec npm run dev
