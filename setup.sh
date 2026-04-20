#!/bin/bash

# SaaS Plug - Multi-Provider Setup Script
# This script sets up all services and dependencies

echo "🚀 SaaS Plug - Multi-Provider Integration Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if npm is installed
check_npm() {
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed. Please install Node.js and npm first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ npm found: $(npm --version)${NC}"
}

# Function to install dependencies for a service
install_service() {
    local service=$1
    echo ""
    echo -e "${YELLOW}📦 Installing dependencies for $service...${NC}"
    
    if [ -d "$service" ]; then
        cd "$service"
        
        # Check if package.json exists
        if [ -f "package.json" ]; then
            npm install
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ $service dependencies installed successfully${NC}"
            else
                echo -e "${RED}❌ Failed to install dependencies for $service${NC}"
                exit 1
            fi
        else
            echo -e "${RED}❌ package.json not found in $service${NC}"
            exit 1
        fi
        
        cd ..
    else
        echo -e "${RED}❌ $service directory not found${NC}"
        exit 1
    fi
}

# Main Setup
echo "📋 Checking prerequisites..."
check_npm

echo ""
echo "🏗️  Setting up all microservices..."

# Install dependencies for each service
install_service "Points_Service"
install_service "Status_Service"
install_service "Reservation_Service"
install_service "API_Gateway"

echo ""
echo -e "${GREEN}✅ All services configured successfully!${NC}"
echo ""
echo "🎯 Next steps:"
echo "=============="
echo ""
echo "1️⃣  Start Points Service:"
echo "   cd Points_Service && npm start"
echo ""
echo "2️⃣  Start Status Service (in new terminal):"
echo "   cd Status_Service && npm start"
echo ""
echo "3️⃣  Start Reservation Service (in new terminal):"
echo "   cd Reservation_Service && npm start"
echo ""
echo "4️⃣  Start API Gateway (in new terminal):"
echo "   cd API_Gateway && npm start"
echo ""
echo "5️⃣  Test services:"
echo "   curl http://localhost:8000/health"
echo ""
echo "📚 See QUICK_START_GUIDE.md for detailed testing instructions"
echo ""
