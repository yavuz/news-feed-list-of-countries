#!/bin/bash

# Build and Validate Script for News Feed Repository
# This script helps contributors validate their feed additions

set -e  # Exit on any error

echo "=========================================="
echo "News Feed Build & Validation"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    echo "Please install npm (usually comes with Node.js)"
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Run the build
echo "🚀 Starting feed validation and generation..."
echo "⏳ This may take a while for large feed lists..."
echo ""

npm run build

echo ""
echo "=========================================="
echo "✅ Build Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check the output above for any failed feeds"
echo "2. Review feeds-by-countries.md to see the generated output"
echo "3. If your feed passed validation, commit your changes:"
echo "   git add ."
echo "   git commit -m 'Add [Your Publication] for [Country]'"
echo "   git push"
echo ""
echo "If your feed failed validation, please check:"
echo "- Is the RSS feed URL correct?"
echo "- Is the feed publicly accessible?"
echo "- Has the feed been updated in the last 24 hours?"
echo ""
