#!/bin/bash

# Migrate and Validate Script for News Feed Repository
# This script migrates feed data from README.md to JSON with validation

set -e  # Exit on any error

echo "=========================================="
echo "News Feed Migration & Validation"
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

# Check if README.md exists
if [ ! -f "README.md" ]; then
    echo "❌ Error: README.md not found."
    echo "Please ensure README.md exists in the current directory."
    exit 1
fi

echo "✅ README.md found"
echo ""

# Run the migration
echo "🚀 Starting migration from README.md to JSON with validation..."
echo "⏳ This may take a while for large feed lists..."
echo ""

npm run migrate

echo ""
echo "=========================================="
echo "✅ Migration Complete!"
echo "=========================================="
echo ""
echo "Results:"
echo "- Validated JSON file: src/news-feed-list-of-countries.json"
echo "- Only valid feeds (updated within 24 hours) were included"
echo ""
echo "Next steps:"
echo "1. Check the output above for validation statistics"
echo "2. Review src/news-feed-list-of-countries.json to see the validated data"
echo "3. If satisfied with the results, commit your changes:"
echo "   git add src/news-feed-list-of-countries.json"
echo "   git commit -m 'Migrate and validate feeds from README'"
echo "   git push"
echo ""
echo "Notes:"
echo "- Feeds that failed validation were excluded from the JSON"
echo "- Failed feeds may be:"
echo "  • Not accessible (HTTP errors)"
echo "  • Not valid RSS/Atom feeds"
echo "  • Outdated (not updated in the last 24 hours)"
echo ""
