#!/bin/bash
# =====================================================
# Database Setup Script for saasPlug Microservices
# =====================================================
# This script sets up all three isolated MariaDB databases
# Usage: bash setup_databases.sh

set -e  # Exit on error

echo "=========================================="
echo "saasPlug Microservices Database Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database credentials (can be overridden)
DB_ROOT_USER=${DB_ROOT_USER:-root}
DB_ROOT_PASS=${DB_ROOT_PASS:-}
DB_HOST=${DB_HOST:-localhost}

# Provider Management Database
PROVIDER_DB="provider_mgmt_db"
PROVIDER_USER="provider_mgmt_user"
PROVIDER_PASS="provider_mgmt_pass"

# Analytics Database
ANALYTICS_DB="analytics_db"
ANALYTICS_USER="analytics_user"
ANALYTICS_PASS="analytics_pass"

# Billing Database
BILLING_DB="billing_db"
BILLING_USER="billing_user"
BILLING_PASS="billing_pass"

# Function to execute SQL
execute_sql() {
  local sql="$1"
  if [ -z "$DB_ROOT_PASS" ]; then
    mysql -u "$DB_ROOT_USER" -h "$DB_HOST" << EOF
$sql
EOF
  else
    mysql -u "$DB_ROOT_USER" -p"$DB_ROOT_PASS" -h "$DB_HOST" << EOF
$sql
EOF
  fi
}

echo -e "${YELLOW}Step 1: Creating Databases${NC}"

# Create Provider Management Database
echo "Creating $PROVIDER_DB..."
execute_sql "CREATE DATABASE IF NOT EXISTS $PROVIDER_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo -e "${GREEN}✓ $PROVIDER_DB created${NC}"

# Create Analytics Database
echo "Creating $ANALYTICS_DB..."
execute_sql "CREATE DATABASE IF NOT EXISTS $ANALYTICS_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo -e "${GREEN}✓ $ANALYTICS_DB created${NC}"

# Create Billing Database
echo "Creating $BILLING_DB..."
execute_sql "CREATE DATABASE IF NOT EXISTS $BILLING_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo -e "${GREEN}✓ $BILLING_DB created${NC}"

echo ""
echo -e "${YELLOW}Step 2: Creating Users and Granting Privileges${NC}"

# Create Provider Management User
echo "Creating user $PROVIDER_USER..."
execute_sql "
CREATE USER IF NOT EXISTS '$PROVIDER_USER'@'$DB_HOST' IDENTIFIED BY '$PROVIDER_PASS';
GRANT ALL PRIVILEGES ON $PROVIDER_DB.* TO '$PROVIDER_USER'@'$DB_HOST';
"
echo -e "${GREEN}✓ User $PROVIDER_USER created${NC}"

# Create Analytics User
echo "Creating user $ANALYTICS_USER..."
execute_sql "
CREATE USER IF NOT EXISTS '$ANALYTICS_USER'@'$DB_HOST' IDENTIFIED BY '$ANALYTICS_PASS';
GRANT ALL PRIVILEGES ON $ANALYTICS_DB.* TO '$ANALYTICS_USER'@'$DB_HOST';
"
echo -e "${GREEN}✓ User $ANALYTICS_USER created${NC}"

# Create Billing User
echo "Creating user $BILLING_USER..."
execute_sql "
CREATE USER IF NOT EXISTS '$BILLING_USER'@'$DB_HOST' IDENTIFIED BY '$BILLING_PASS';
GRANT ALL PRIVILEGES ON $BILLING_DB.* TO '$BILLING_USER'@'$DB_HOST';
"
echo -e "${GREEN}✓ User $BILLING_USER created${NC}"

echo ""
echo -e "${YELLOW}Step 3: Flushing Privileges${NC}"
execute_sql "FLUSH PRIVILEGES;"
echo -e "${GREEN}✓ Privileges flushed${NC}"

echo ""
echo -e "${YELLOW}Step 4: Creating Tables from SQL Scripts${NC}"

# Check and run schema files
if [ -f "Provider_Management_Service/db/schema.sql" ]; then
  echo "Initializing Provider_Management_Service schema..."
  if [ -z "$DB_ROOT_PASS" ]; then
    mysql -u "$PROVIDER_USER" -p"$PROVIDER_PASS" -h "$DB_HOST" $PROVIDER_DB < Provider_Management_Service/db/schema.sql
  else
    mysql -u "$PROVIDER_USER" -p"$PROVIDER_PASS" -h "$DB_HOST" $PROVIDER_DB < Provider_Management_Service/db/schema.sql
  fi
  echo -e "${GREEN}✓ Provider_Management_Service schema created${NC}"
else
  echo -e "${RED}✗ Provider_Management_Service/db/schema.sql not found${NC}"
fi

if [ -f "Analytics_Service/db/schema.sql" ]; then
  echo "Initializing Analytics_Service schema..."
  if [ -z "$DB_ROOT_PASS" ]; then
    mysql -u "$ANALYTICS_USER" -p"$ANALYTICS_PASS" -h "$DB_HOST" $ANALYTICS_DB < Analytics_Service/db/schema.sql
  else
    mysql -u "$ANALYTICS_USER" -p"$ANALYTICS_PASS" -h "$DB_HOST" $ANALYTICS_DB < Analytics_Service/db/schema.sql
  fi
  echo -e "${GREEN}✓ Analytics_Service schema created${NC}"
else
  echo -e "${RED}✗ Analytics_Service/db/schema.sql not found${NC}"
fi

if [ -f "Billing_Service/db/schema.sql" ]; then
  echo "Initializing Billing_Service schema..."
  if [ -z "$DB_ROOT_PASS" ]; then
    mysql -u "$BILLING_USER" -p"$BILLING_PASS" -h "$DB_HOST" $BILLING_DB < Billing_Service/db/schema.sql
  else
    mysql -u "$BILLING_USER" -p"$BILLING_PASS" -h "$DB_HOST" $BILLING_DB < Billing_Service/db/schema.sql
  fi
  echo -e "${GREEN}✓ Billing_Service schema created${NC}"
else
  echo -e "${RED}✗ Billing_Service/db/schema.sql not found${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Database Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  Provider Management Database: $PROVIDER_DB"
echo "    User: $PROVIDER_USER"
echo "    Password: $PROVIDER_PASS"
echo ""
echo "  Analytics Database: $ANALYTICS_DB"
echo "    User: $ANALYTICS_USER"
echo "    Password: $ANALYTICS_PASS"
echo ""
echo "  Billing Database: $BILLING_DB"
echo "    User: $BILLING_USER"
echo "    Password: $BILLING_PASS"
echo ""
echo "Next steps:"
echo "  1. Copy .env.template files to .env in each service directory"
echo "  2. Update credentials if different from defaults"
echo "  3. Install dependencies: npm install in each service"
echo "  4. Start services: node src/index.js"
