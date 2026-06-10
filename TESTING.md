# Testing Guide - Documentation Scraper

This guide will help you test your upgraded documentation scraper locally.

## Prerequisites

Before testing, you need:

1. **Weaviate Instance** - Vector database for storing docs
   - Get a free cloud instance at [weaviate.io](https://console.weaviate.cloud/)
   - Or use local Weaviate with Docker

2. **OpenAI API Key** - For embeddings and LLM
   - Get from [platform.openai.com](https://platform.openai.com/api-keys)

3. **Apify CLI** - Already installed if you've been developing
   ```bash
   npm install -g apify-cli
   ```

---

## Step 1: Set Up Environment Variables

Create a `.env` file in your project root (it's already in .gitignore):

```bash
# Create .env file
cat > .env << 'EOF'
# Weaviate Configuration
WEAVIATE_HOST=your-cluster-name.weaviate.network
WEAVIATE_API_KEY=your-weaviate-api-key

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key
EOF
```

**Important:** Replace the placeholder values with your actual credentials!

**To get Weaviate credentials:**
1. Go to https://console.weaviate.cloud/
2. Create a free cluster (14-day sandbox)
3. Copy the cluster URL (without https://)
4. Get API key from Settings

---

## Step 2: Create Test Input Files

I've created sample input files for you. Here are some quick tests:

### Test 1: Small Documentation Site (Recommended First Test)

Use the sample file `INPUT-test-small.json`:

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://crawlee.dev/docs/quick-start",
  "followLinks": true,
  "extractMetadata": true,
  "urlPatterns": ["/docs/quick-start"],
  "maxRequestsPerCrawl": 10,
  "maxDepth": 2,
  "debugLog": true
}
```

This will:
- Start at Crawlee's quick-start page
- Follow up to 10 links
- Only crawl pages matching `/docs/quick-start`
- Show detailed debug logs

### Test 2: With Sitemap

Use `INPUT-test-sitemap.json`:

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://crawlee.dev/sitemap.xml",
  "followLinks": false,
  "maxRequestsPerCrawl": 20,
  "debugLog": true
}
```

---

## Step 3: Run Local Tests

### Option A: Using Apify CLI (Recommended)

```bash
# Test with the small sample
apify run --input-file INPUT-test-small.json

# Or test with sitemap
apify run --input-file INPUT-test-sitemap.json
```

### Option B: Using npm Scripts

```bash
# This uses the default INPUT.json from storage/key_value_stores/default/
npm run start:dev
```

### Option C: Direct TypeScript Execution

```bash
# Run with tsx directly
npx tsx src/main.ts
```

---

## Step 4: Monitor Output

Watch for these key log messages:

### ✅ Success Indicators

```
🚀 Starting Actor in INGEST mode
Detected framework: Docusaurus
Extracted metadata: Quick Start Guide
[UPDATE] Content changed for https://crawlee.dev/docs/quick-start
[SUCCESS] Indexing complete for https://crawlee.dev/docs/quick-start
📊 Progress: Processed=5, Updated=5, Skipped=0, Failed=0
✅ Pipeline finished
```

### ⚠️ Watch Out For

```
❌ Missing Config: WEAVIATE_HOST, WEAVIATE_API_KEY, and OPENAI_API_KEY
→ Solution: Check your .env file or environment variables

Failed to process https://example.com: Error message
→ Solution: Check if URL is accessible, enable debugLog

Skipping https://example.com: Content too short
→ Normal: Page has very little content
```

---

## Step 5: Verify Data in Weaviate

After ingestion, check if data was stored:

### Using Weaviate Console

1. Go to https://console.weaviate.cloud/
2. Select your cluster
3. Go to "Objects" tab
4. Look for class "Documentation"
5. You should see objects with properties like:
   - `content`
   - `source_url`
   - `title`
   - `headings`
   - `code_languages`

### Using the Actor (Search Mode)

Create `INPUT-test-search.json`:

```json
{
  "mode": "SEARCH",
  "query": "How do I install Crawlee?",
  "useSmallLLM": true
}
```

Run it:
```bash
apify run --input-file INPUT-test-search.json
```

Check the output in `storage/datasets/default/`

---

## Step 6: Advanced Testing

### Test Different Documentation Sites

#### Test with Docusaurus (React Docs)
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://react.dev/learn",
  "followLinks": true,
  "urlPatterns": ["/learn/"],
  "maxRequestsPerCrawl": 20,
  "maxDepth": 2,
  "debugLog": true
}
```

#### Test with GitBook
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://docs.apify.com/platform/actors",
  "followLinks": true,
  "urlPatterns": ["/platform/actors/"],
  "maxRequestsPerCrawl": 15,
  "debugLog": true
}
```

#### Test with VuePress
```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://vuepress.vuejs.org/guide/",
  "followLinks": true,
  "maxRequestsPerCrawl": 10,
  "debugLog": true
}
```

---

## Troubleshooting

### Issue: "Cannot find module 'dotenv'"

The actor doesn't use dotenv by default. Environment variables are set via:

1. **Apify Console** - When deployed
2. **Local .env** - Loaded by Apify CLI automatically
3. **Shell export** - `export OPENAI_API_KEY=sk-...`

### Issue: "ECONNREFUSED" errors

Your Weaviate cluster might be:
- Not running (if local)
- URL incorrect (check WEAVIATE_HOST)
- Firewall blocking access

### Issue: No data being stored

Check:
1. Weaviate credentials are correct
2. OpenAI API key is valid and has credits
3. `debugLog: true` to see what's happening
4. Check if content is being extracted (look for "Content too short" warnings)

### Issue: Too slow

Reduce settings for testing:
```json
{
  "maxRequestsPerCrawl": 5,
  "maxDepth": 1,
  "followLinks": false
}
```

---

## Quick Test Checklist

- [ ] Environment variables set (WEAVIATE_HOST, WEAVIATE_API_KEY, OPENAI_API_KEY)
- [ ] Dependencies installed (`npm install`)
- [ ] Code builds (`npm run build`)
- [ ] Small test runs successfully (10 pages max)
- [ ] Data appears in Weaviate
- [ ] Search mode returns results
- [ ] Logs show framework detection
- [ ] Metadata extraction working (titles, headings)
- [ ] Link discovery working (if followLinks: true)
- [ ] Error handling working (try invalid URL)

---

## Example: Full Test Session

```bash
# 1. Set up environment
export WEAVIATE_HOST=my-cluster.weaviate.network
export WEAVIATE_API_KEY=my-weaviate-key
export OPENAI_API_KEY=sk-my-openai-key

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Run small test
apify run --input-file INPUT-test-small.json

# 5. Check logs for success
# Look for: "✅ Pipeline finished"

# 6. Test search
apify run --input-file INPUT-test-search.json

# 7. Check output
cat storage/datasets/default/000000001.json
```

---

## Next Steps

Once local testing works:

1. **Deploy to Apify**
   ```bash
   apify login
   apify push
   ```

2. **Set Environment Variables in Apify Console**
   - Go to your actor settings
   - Add environment variables
   - Run from console

3. **Schedule Regular Updates**
   - Use Apify Scheduler
   - Run daily/weekly to update docs

---

## Getting Help

If you encounter issues:

1. Enable `debugLog: true`
2. Check framework detection in logs
3. Verify credentials
4. Start with small `maxRequestsPerCrawl` (5-10)
5. Check this file for common issues

Happy testing! 🚀
