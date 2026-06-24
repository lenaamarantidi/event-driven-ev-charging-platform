#!/bin/bash

# find_env_variables.sh
# Accepts a file path and resolves it in this order:
# 1. Absolute path (if starts with /)
# 2. Project root + path
# 3. Current directory + path
# Returns the first file that exists, or error if none found

set -e

if [ $# -eq 0 ]; then
  echo "Usage: $0 <file_path>"
  echo "Examples:"
  echo "  $0 .env"
  echo "  $0 /absolute/path/to/.env"
  echo "  $0 env/.env.local"
  exit 1
fi

TARGET_FILE="$1"

# Function to resolve a path and check if it exists
resolve_path() {
  local path="$1"
  local description="$2"
  
  if [ -f "$path" ]; then
    echo "$path"
    return 0
  fi
  return 1
}

# Strategy 1: Absolute path (if starts with /)
if [[ "$TARGET_FILE" == /* ]]; then
  if resolve_path "$TARGET_FILE" "absolute path"; then
    exit 0
  else
    echo "Error: Absolute path not found: $TARGET_FILE" >&2
    exit 1
  fi
fi

# Strategy 2: Project root + path
# Assume project root is where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

if resolve_path "$PROJECT_ROOT/$TARGET_FILE" "project root"; then
  exit 0
fi

# Strategy 3: Current directory + path
if resolve_path "./$TARGET_FILE" "current directory"; then
  exit 0
fi

# If we get here, file not found
echo "Error: File not found: $TARGET_FILE" >&2
echo "Tried:" >&2
echo "  1. Absolute path: $TARGET_FILE" >&2
echo "  2. Project root:  $PROJECT_ROOT/$TARGET_FILE" >&2
echo "  3. Current dir:   ./$TARGET_FILE" >&2
exit 1
