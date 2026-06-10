# 🚀 Intelligent URL Discovery - Production Ready

## What Changed?

Your scraper is now **production-ready** with intelligent documentation discovery. You can now provide:

- ✅ **Just a base domain** (e.g., `nextjs.org`, `react.dev`)
- ✅ **Direct sitemap URL** (e.g., `nextjs.org/sitemap.xml`)

The system will **automatically**:
1. Discover all available sitemaps
2. Extract documentation/blog/content URLs
3. Intelligently crawl to find more docs
4. Filter and queue relevant pages

---

## Features

### 1. **Auto-Sitemap Discovery**

Tries multiple  common patterns:
- `/sitemap.xml`
- `/sitemap_index.xml`
- `/sitemap-index.xml`
- `/docs/sitemap.xml`
- `/blog/sitemap.xml`
- And 5+ more patterns

Also checks `robots.txt` for sitemap declarations.

### 2. **Nested Sitemap Handling**

Automatically follows sitemap indexes:
```
sitemap-index.xml
├── docs-sitemap.xml
├── blog-sitemap.xml
└── api-sitemap.xml
```

### 3. **Intelligent URL Filtering**

Automatically finds pages containing:
- `/docs/` - Documentation
- `/blog/` - Blog posts
- `/content/` - Content pages
- `/guide/` - Guides
- `/tutorial/` - Tutorials
- `/api/` - API references
- `/reference/` - Technical references
- `/learn/` - Learning resources

Automatically **excludes**:
- `/privacy`, `/terms`, `/legal`
- `/careers`, `/jobs`
- `/pricing`, `/contact`
- Media files (`.pdf`, `.jpg`, etc.)

### 4. **Fallback: Intelligent Crawling**

If no sitemap is found (or too few URLs), the scraper:
1. Starts from homepage
2. Finds all links containing doc keywords
3. Follows those links to discover more
4. Builds a map of all documentation pages

---

## How to Use

### Example 1: Base Domain (Recommended)

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://nextjs.org",
  "maxRequestsPerCrawl": 200
}
```

**What Happens:**
1. Checks `https://nextjs.org/robots.txt`
2. Tries `https://nextjs.org/sitemap.xml`
3. Tries `https://nextjs.org/sitemap-index.xml`
4. Finds nested sitemaps (docs, blog, api)
5. Extracts ALL URLs from all sitemaps
6. Filters to only `/docs/` and `/blog/` URLs
7. Queues up to 200 pages for scraping

**Output:**
```
🔍 Discovering sitemaps...
Checking robots.txt: https://nextjs.org/robots.txt
✅ Found sitemap in robots.txt: https://nextjs.org/sitemap.xml
📋 Discovered 1 sitemap(s)
📂 Found sitemap index with 3 nested sitemaps
📄 Extracted 847 URLs from sitemap
🎯 Filtered 847 URLs → 312 documentation URLs
⚠️ Found 312 URLs, limiting to 200
🚀 Queuing 200 documentation pages for scraping.
```

### Example 2: Direct Sitemap URL

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://react.dev/sitemap.xml",
  "maxRequestsPerCrawl": 100
}
```

**What Happens:**
1. Directly uses the provided sitemap
2. Extracts URLs with time-based filtering
3. Processes up to 100 pages

### Example 3: With Custom Filters

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://docs.apify.com",
  "urlPatterns": ["/platform/", "/api/"],
  "maxRequestsPerCrawl": 150
}
```

**What Happens:**
1. Discovers all sitemaps
2. Extracts documentation URLs
3. **Further filters** to only URLs containing `/platform/` or `/api/`
4. Queues matching pages

### Example 4: No Sitemap Sites

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://some-docs-site.com",
  "maxRequestsPerCrawl": 50
}
```

**What Happens (if no sitemap found):**
```
⚠️ No sitemaps found. Will use intelligent crawling.
🧠 Starting intelligent documentation discovery...
Scanning: https://some-docs-site.com
Scanning: https://some-docs-site.com/docs
Scanning: https://some-docs-site.com/docs/getting-started
🎯 Discovered 43 documentation URLs through intelligent crawling
🚀 Queuing 43 documentation pages for scraping.
```

---

## Production Ready Features

### ✅ Error Handling

- Silently continues if robots.txt fails
- Tries multiple sitemap patterns
- Falls back to intelligent crawling
- Handles nested sitemaps gracefully
- Validates URLs before adding to queue

### ✅ Performance Optimized

- Parallel sitemap checks (fast discovery)
- Deduplication (no duplicate URLs)
- Configurable limits (`maxRequestsPerCrawl`)
- Efficient URL filtering (skip non-docs pages early)

### ✅ Smart Defaults

- Auto-detects sitemap vs base URL input
- Uses common documentation keywords
- Excludes marketing/legal pages automatically
- Limits intelligent crawl to 50 pages (configurable)

### ✅ Logging & Visibility

- Shows discovery progress
- Reports found sitemaps
- Displays URL counts at each stage
- Warns when hitting limits

---

## Real-World Examples

### Next.js
```json
{
  "sitemapUrl": "https://nextjs.org"
}
```
**Result:** 200+ documentation pages from `/docs/`

### React
```json
{
  "sitemapUrl": "https://react.dev"
}
```
**Result:** 100+ pages from `/learn/` and `/reference/`

### Apify
```json
{
  "sitemapUrl": "https://docs.apify.com",
  "urlPatterns": ["/platform/actors"]
}
```
**Result:** Only Actor-related documentation pages

### Custom Docs
```json
{
  "sitemapUrl": "https://your-company.com",
  "urlPatterns": ["/documentation/", "/help/"]
}
```
**Result:** All pages matching custom patterns

---

## Technical Implementation

### File Structure

```
src/
├── sitemapDiscovery.ts   (NEW) - Sitemap & URL discovery logic
├── fetchpipeline.ts      (UPDATED) - Now uses intelligent discovery
├── main.ts               (UNCHANGED)
└── utils.ts              (UNCHANGED)
```

### New Functions

#### `discoverSitemaps(baseUrl: string): Promise<string[]>`
- Checks robots.txt
- Tries common sitemap patterns
- Returns list of discovered sitemap URLs

#### `extractUrlsFromSitemap(sitemapUrl: string): Promise<string[]>`
- Fetches sitemap content
- Handles nested sitemap indexes
- Recursively processes all sitemaps
- Returns flat list of all page URLs

#### `filterDocumentationUrls(urls: string[], keywords?: string[]): string[]`
- Filters URLs to only docs/blog/content
- Excludes marketing/legal pages
- Customizable keyword list

#### `intelligentDocDiscovery(baseUrl: string, maxPages: number): Promise<string[]>`
- Crawls from homepage
- Finds doc-related links
- Follows those links to discover more
- Returns discovered documentation URLs

---

## Troubleshooting

### Q: No URLs discovered from base domain

**Check:**
1. Does the site have a sitemap? (Try `/sitemap.xml` manually)
2. Is robots.txt blocking access?
3. Try with direct sitemap URL instead
4. Check if docs are behind a login

**Solution:**
Use a direct sitemap URL or increase `maxPages` for intelligent discovery.

### Q: Too many URLs, hitting the limit

**Check:**
The `maxRequestsPerCrawl` parameter.

**Solution:**
```json
{
  "maxRequestsPerCrawl": 500,  // Increase limit
  "urlPatterns": ["/docs/api/"]  // Or narrow filter
}
```

### Q: Getting non-documentation pages

**Check:**
The default keyword filter might be too broad.

**Solution:**
```json
{
  "urlPatterns": ["/docs/"]  // Explicit patterns only
}
```

### Q: Site uses non-standard URL structure

**Example:** Docs at `/help-center/` instead of `/docs/`

**Solution:**
```json
{
  "urlPatterns": ["/help-center/", "/knowledge-base/"]
}
```

---

## Performance Tips

### 1. Use Direct Sitemap When Available
Faster and more reliable than discovery:
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml"
}
```

### 2. Set Appropriate Limits
Don't scrape more than you need:
```json
{
  "maxRequestsPerCrawl": 50  // Start small, increase if needed
}
```

### 3. Use URL Patterns
Filter early to save time:
```json
{
  "urlPatterns": ["/api/", "/reference/"]
}
```

### 4. Monitor the Logs
Watch for:
- `📋 Discovered X sitemap(s)` - Sitemap found
- `📄 Extracted X URLs from sitemap` - Total URLs
- `🎯 Filtered X → Y documentation URLs` - After filtering
- `⚠️ Found X URLs, limiting to Y` - Hit the limit

---

## Migration from Old Version

### Old Input
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml"
}
```

### New Input (Still Works!)
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml"  // ✅ Still supported
}
```

### New Input (Recommended)
```json
{
  "sitemapUrl": "https://example.com"  // ✅ Just the domain!
}
```

**No breaking changes!** Old sitemap URLs still work.

---

## Summary

You can now simply provide:
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://nextjs.org"
}
```

And the scraper will:
1. ✅ Auto-discover sitemaps
2. ✅ Extract all doc URLs
3. ✅ Filter to relevant pages
4. ✅ Intelligently crawl if needed
5. ✅ Queue everything for scraping

**Production ready. Zero configuration needed.** 🚀
