#!/bin/bash

# Documentation Scraper - Quick Test Script
# This script helps you quickly test your documentation scraper

echo "🚀 Documentation Scraper - Quick Test"
echo "======================================"
echo ""

# Check if environment variables are set
if [ -z "$WEAVIATE_HOST" ] || [ -z "$WEAVIATE_API_KEY" ] || [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  Environment variables not set!"
    echo ""
    echo "Please set the following environment variables:"
    echo "  export WEAVIATE_HOST=your-cluster.weaviate.network"
    echo "  export WEAVIATE_API_KEY=your-weaviate-api-key"
    echo "  export OPENAI_API_KEY=sk-your-openai-api-key"
    echo ""
    echo "Or create a .env file (see TESTING.md for details)"
    echo ""
    exit 1
fi

echo "✅ Environment variables detected"
echo ""

# Show menu
echo "Select a test to run:"
echo ""
echo "  1) Small test (10 pages, Crawlee quick-start)"
echo "  2) Sitemap test (20 pages, Crawlee sitemap)"
echo "  3) Search test (requires data already ingested)"
echo "  4) Custom input file"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "🔍 Running small test with link discovery..."
        echo "This will crawl ~10 pages from Crawlee documentation"
        echo ""
        apify run --input-file INPUT-test-small.json
        ;;
    2)
        echo ""
        echo "🗺️  Running sitemap test..."
        echo "This will crawl up to 20 pages from sitemap"
        echo ""
        apify run --input-file INPUT-test-sitemap.json
        ;;
    3)
        echo ""
        echo "🔎 Running search test..."
        echo "This requires you to have already ingested some documentation"
        echo ""
        apify run --input-file INPUT-test-search.json
        ;;
    4)
        read -p "Enter input file path: " input_file
        if [ -f "$input_file" ]; then
            echo ""
            echo "📄 Running with custom input: $input_file"
            echo ""
            apify run --input-file "$input_file"
        else
            echo "❌ File not found: $input_file"
            exit 1
        fi
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "✨ Test complete!"
echo ""
echo "Next steps:"
echo "  - Check logs above for success/errors"
echo "  - View data in Weaviate console"
echo "  - Check storage/datasets/default/ for output"
echo ""
