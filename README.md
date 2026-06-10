# Weaviate Knowledge Base Actor

A documentation scraper and semantic search actor built with [Crawlee](https://crawlee.dev/) and [Weaviate](https://weaviate.io/). It scrapes any documentation site, stores content as vector embeddings in Weaviate, and lets you query it with natural language.

## What it does

- **INGEST mode** — Crawls a docs site, embeds the content with OpenAI, and pushes it to Weaviate
- **SEARCH mode** — Takes a natural language question, expands it with GPT-4o-mini, and returns the most relevant docs

---

## Prerequisites

Before running locally you need accounts and API keys for:

| Service | Where to get it |
|---|---|
| [Weaviate Cloud](https://console.weaviate.cloud) | Create a free cluster → copy Host URL and API Key |
| [OpenAI](https://platform.openai.com/api-keys) | Create an API key |
| [Apify CLI](https://docs.apify.com/cli) | `npm install -g apify-cli` |

---

## Local Setup

**1. Install dependencies**

```bash
npm install
```

**2. Set your API keys**

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
WEAVIATE_HOST=your-cluster.weaviate.network
WEAVIATE_API_KEY=your-weaviate-api-key
OPENAI_API_KEY=sk-your-openai-key
```

**3. Create the input folder**

```bash
mkdir -p storage/key_value_stores/default
```

---

## Run: INGEST (Scrape & Index Docs)

Create `storage/key_value_stores/default/INPUT.json` with the following content — replace the credential values with your own:

```json
{
  "mode": "INGEST",
  "sitemapUrl": "https://crawlee.dev",
  "followLinks": true,
  "extractMetadata": true,
  "urlPatterns": [],
  "maxRequestsPerCrawl": 100,
  "maxDepth": 3,
  "weaviateHost": "your-cluster.weaviate.network",
  "weaviateApiKey": "your-weaviate-api-key",
  "openaiApiKey": "sk-your-openai-key"
}
```

Then run:

```bash
apify run
```

**Expected output:**

```
INFO  🚀 Starting Actor in INGEST mode
INFO  [1/100] Processing (99 left): https://crawlee.dev/js/docs/quick-start
INFO  [UPDATE] Content changed for ... Re-indexing.
INFO  [SUCCESS] Indexing complete for ...
INFO  ✅ Pipeline finished.
```

> **Tip:** Change `sitemapUrl` to any docs site you want to index (e.g. `https://nextjs.org`, `https://docs.stripe.com`).  
> Increase `maxRequestsPerCrawl` to index more pages. Set `urlPatterns: []` to index all docs sections.

---

## Run: SEARCH (Query the Indexed Docs)

Update `storage/key_value_stores/default/INPUT.json` to SEARCH mode:

```json
{
  "mode": "SEARCH",
  "query": "How do I install and configure Crawlee?",
  "useSmallLLM": true,
  "weaviateHost": "your-cluster.weaviate.network",
  "weaviateApiKey": "your-weaviate-api-key",
  "openaiApiKey": "sk-your-openai-key"
}
```

Then run:

```bash
apify run
```

**Expected output:**

```
INFO  🚀 Starting Actor in SEARCH mode
INFO  🧠 Expanding Query with Small LLM...
INFO  🔍 Executing Hybrid Search...
INFO  ✅ Found 5 results for query: "How do I install and configure Crawlee?"
INFO     Title: Quick Start
INFO     URL: https://crawlee.dev/js/docs/quick-start
INFO     Content Preview: The fastest way to try Crawlee...
```

> **Tip:** Change `"query"` to any question you want. Set `"useSmallLLM": false` to skip query expansion and search directly.

---

## How Change Detection Works

On the **second INGEST run**, pages that haven't changed are automatically skipped — no re-embedding, no API cost. Only new or modified pages are re-indexed.

This is done via SHA-256 hashing of each page's content, stored in the local KV store under `storage/key_value_stores/SITEMAP_STATE/`.

---

## Project Structure

```
.actor/
├── actor.json          # Actor config
├── input_schema.json   # Input validation & Console form
├── output_schema.json  # Output definition
└── dataset_schema.json # Dataset column definitions
src/
├── main.ts             # Entry point, reads input, calls pipelines
├── fetchpipeline.ts    # INGEST: crawl → chunk → embed → upload
├── searchPipeline.ts   # SEARCH: query expansion → vector search → display
├── sitemapDiscovery.ts # Sitemap + intelligent URL discovery
├── utils.ts            # Embedding, chunking, Weaviate helpers
└── types.ts            # TypeScript types
Dockerfile              # Container definition for Apify Cloud
```

---

## Deploy to Apify Cloud

```bash
apify login   # enter your Apify API token
apify push    # builds and deploys the actor
```

After deploying, open the Actor in [Apify Console](https://console.apify.com/actors) and fill in credentials via the UI — no `INPUT.json` needed on the cloud.
