#!/bin/bash

# Build and Validate Script for News Feed Repository
# This script helps contributors validate their feed additions

set -e  # Exit on any error

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    echo "Please install npm (usually comes with Node.js)"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run the build
# Pass all arguments to npm run codegen (e.g., -log)
npm run codegen -- "$@"
