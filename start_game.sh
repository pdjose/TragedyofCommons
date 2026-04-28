#!/bin/bash

echo ""
echo "============================================"
echo " Tragedy of the Commons - Shared Sea Edition"
echo "============================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Install it from: https://nodejs.org/"
    echo "Or use your package manager:"
    echo "  macOS:  brew install node"
    echo "  Ubuntu: sudo apt install nodejs npm"
    echo ""
    exit 1
fi

echo "Node.js version: $(node --version)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (first run)..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies."
        exit 1
    fi
    echo "Dependencies installed!"
    echo ""
fi

# Start server
echo "Starting simulation server..."
echo "-------------------------------------------"
echo ""
echo "TEACHER: Open http://localhost:3000/admin"
echo "STUDENTS: Open http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server."
echo "-------------------------------------------"
echo ""

node server.js
