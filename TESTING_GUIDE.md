# Quick Test Guide - Intelligent Discovery

## Test 1: Base Domain (Next.js)

**Input:**
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://nextjs.org",
  "maxRequestsPerCrawl": 10,
  "extractMetadata": true
}
```

**Expected Output:**
```
🔍 Discovering sitemaps...
✅ Found sitemap in robots.txt: https://nextjs.org/sitemap.xml
📄 Extracted X URLs from sitemap
🎯 Filtered X URLs → Y documentation URLs
🚀 Queuing 10 documentation pages for scraping.
```

---

## Test 2: Direct Sitemap (Still Works!)

**Input:**
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://crawlee.dev/sitemap.xml",
  "maxRequestsPerCrawl": 5
}
```

**Expected Output:**
```
🗺️ Fetching Sitemap: https://crawlee.dev/sitemap.xml
🚀 Queuing 5 pages for scraping.
```

---

## Test 3: With URL Patterns

**Input:**
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://docs.apify.com",
  "urlPatterns": ["/platform/actors/"],
  "maxRequestsPerCrawl": 20
}
```

**Expected Output:**
```
🔍 Discovering sitemaps...
🎯 Filtered X URLs → Y documentation URLs
🎯 Filtered by user patterns: Y → Z URLs
🚀 Queuing Z documentation pages for scraping.
```

---

## Test 4: No Sitemap (Intelligent Mode)

For sites without sitemaps, create a test on a smaller docs site or:

**Input:**
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://your-test-site.com",
  "maxRequestsPerCrawl": 20
}
```

**Expected Output:**
```
⚠️ No sitemaps found. Will use intelligent crawling.
🧠 Starting intelligent documentation discovery...
Scanning: https://your-test-site.com
🎯 Discovered X documentation URLs through intelligent crawling
🚀 Queuing X documentation pages for scraping.
```

---

## Test 5: Search After Ingestion

After running Test 1, test search:

**Input:**
```json
{
  "mode": "SEARCH",
  "query": "how to create API routes in Next.js"
}
```

**Expected Output:**
```
✅ Found 5 results for query: "how to create API routes in Next.js"
📄 Top Result Preview:
   Title: API Routes
   URL: https://nextjs.org/docs/api-routes/...
   Has Code: Yes
   Code Languages: javascript
   Content Preview: [CODE:javascript]...
```

---

## Verification Checklist

After running tests, verify:

- [ ] Sitemaps are discovered automatically
- [ ] Only docs/blog/content URLs are queued
- [ ] Max requests limit is respected
- [ ] URL patterns filter correctly
- [ ] Intelligent crawling works when no sitemap
- [ ] Content has code blocks preserved (check `[CODE:]` markers)
- [ ] Search returns relevant results
- [ ] UI displays all fields (Has Code, Code Languages, etc.)

---

## Quick Commands

### Push to Apify
```bash
npx apify push --force
```

### Run Locally (Ingest)
```bash
# Set environment variables
export WEAVIATE_HOST="your-cluster.weaviate.network"
export WEAVIATE_API_KEY="your-api-key"
export OPENAI_API_KEY="sk-your-key"

# Run
npx apify run -p
```

### Check Logs
Look for these key messages:
- `🔍 Discovering sitemaps...` - Discovery started
- `✅ Found sitemap...` - Sitemap located
- `📄 Extracted X URLs` - URLs extracted
- `🎯 Filtered X → Y` - Filtering complete
- `Extracted X characters with Y code blocks` - Content scraped
- `✅ Found X results` - Search complete

---

## Troubleshooting

### No URLs found
- Check if site has a sitemap: `curl https://example.com/sitemap.xml`
- Try with `/sitemap-index.xml` or `/docs/sitemap.xml`
- Enable intelligent crawling (it's automatic)

### Too few URLs
- Increase `maxRequestsPerCrawl`
- Remove or broaden `urlPatterns`

### Wrong pages scraped
- Add more specific `urlPatterns`
- Check the filtering logic in logs

### Code blocks not preserved
- Check logs for "Extracted X characters with Y code blocks"
- Should see `[CODE:language]` markers in content
- If 0 code blocks, the page might not have `<code>` tags
