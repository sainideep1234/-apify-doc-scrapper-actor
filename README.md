# Weaviate Knowledge Base Actor

A documentation scraper and semantic search actor built with [Crawlee](https://crawlee.dev/) and [Weaviate](https://weaviate.io/). It scrapes any documentation site, stores content as vector embeddings in Weaviate, and lets you query it with natural language.

## What it does

- **INGEST mode** — Crawls a docs site, embeds the content with OpenAI, and pushes it to Weaviate
- **SEARCH mode** — Takes a natural language question, expands it with GPT-4o-mini, and returns the most relevant docs

---

## Prerequisites

You need the following before running locally:

**1. Node.js v18 or higher**

Check your version:
```bash
node --version   # must be v18.0.0 or above
```

Download from [nodejs.org](https://nodejs.org/) if needed.

**2. Apify CLI**

```bash
npm install -g apify-cli
```

**3. Three API keys**

| Service | Where to get it |
|---|---|
| [Weaviate Cloud](https://console.weaviate.cloud) | Create a free cluster → copy the **Host URL** and **API Key** |
| [OpenAI](https://platform.openai.com/api-keys) | Create an API key (needs billing enabled for embeddings) |

---

## Local Setup

**Step 1 — Clone and install dependencies**

```bash
git clone https://github.com/sainideep1234/-apify-doc-scrapper-actor.git
cd apify-doc-scrapper-actor
npm install
```

**Step 2 — Set your API keys**

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
WEAVIATE_HOST=your-cluster.weaviate.network
WEAVIATE_API_KEY=your-weaviate-api-key
OPENAI_API_KEY=sk-your-openai-key
```

**Step 3 — Create the storage folder**

The `storage/` folder is gitignored so it will never exist after a fresh clone. Create it manually:

```bash
mkdir -p storage/key_value_stores/default
```

This is where `apify run` reads the `INPUT.json` file from locally.

**Step 4 — Create your INPUT.json**

This repo has ready-made templates in the [`input-examples/`](./input-examples/) folder.

For **INGEST** (first time — scrape and index a site):
```bash
cp input-examples/ingest.json storage/key_value_stores/default/INPUT.json
```

For **SEARCH** (after ingesting — query what's indexed):
```bash
cp input-examples/search.json storage/key_value_stores/default/INPUT.json
```

Now open `storage/key_value_stores/default/INPUT.json` and replace the three placeholder values:
- `YOUR_CLUSTER.weaviate.network` → your Weaviate Host URL
- `YOUR_WEAVIATE_API_KEY` → your Weaviate API Key
- `YOUR_OPENAI_API_KEY` → your OpenAI API Key

> **Note:** The `storage/` folder is in `.gitignore` — your credentials will never be committed to git.

---

## Running the Actor

### INGEST — Scrape & Index a Docs Site

Make sure your `INPUT.json` has `"mode": "INGEST"` and a valid `sitemapUrl`, then run:

```bash
apify run
```

**Expected output:**

```
INFO  🚀 Starting Actor in INGEST mode
INFO  🔍 Starting intelligent documentation discovery...
INFO  🚀 Queuing 100 documentation pages for scraping.
INFO  [1/100] Processing (99 left): https://crawlee.dev/js/docs/quick-start
INFO  [UPDATE] Content changed for ... Re-indexing.
INFO  [SUCCESS] Indexing complete for ...
INFO  ✅ Pipeline finished.
INFO  📊 Final Stats: Processed=100, Updated=98, Skipped=2, Failed=0
```

**Tips:**
- Change `sitemapUrl` in your `INPUT.json` to any docs site (e.g. `https://nextjs.org`, `https://docs.stripe.com`)
- Increase `maxRequestsPerCrawl` to crawl more pages
- Keep `urlPatterns: []` to index all sections of the docs

---

### SEARCH — Query the Indexed Docs

Switch to SEARCH mode by copying the search template (your `INPUT.json` gets replaced):

```bash
cp input-examples/search.json storage/key_value_stores/default/INPUT.json
```

Fill in your credentials + change the `"query"` field to your question, then run:

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

**Tips:**
- Change `"query"` to any question about the docs you indexed
- Set `"useSmallLLM": false` to skip query expansion and search directly

---

## How Change Detection Works

On subsequent INGEST runs, the actor automatically skips pages that haven't changed — no re-embedding, no API cost. Only new or modified pages are re-indexed.

This works via SHA-256 hashing of each page's content, stored locally in `storage/key_value_stores/SITEMAP_STATE/`.

---

## Project Structure

```
.actor/
├── actor.json          # Actor config
├── input_schema.json   # Input validation & Console form
├── output_schema.json  # Output definition
└── dataset_schema.json # Dataset column definitions
src/
├── main.ts             # Entry point — reads input, calls pipelines
├── fetchpipeline.ts    # INGEST: crawl → chunk → embed → upload to Weaviate
├── searchPipeline.ts   # SEARCH: query expansion → vector search → display results
├── sitemapDiscovery.ts # Sitemap + intelligent URL discovery
├── utils.ts            # Embedding, chunking, Weaviate helpers
└── types.ts            # TypeScript types
input-examples/
├── ingest.json         # INGEST mode input template (no credentials)
└── search.json         # SEARCH mode input template (no credentials)
Dockerfile              # Container definition for Apify Cloud
```

---

## Deploy to Apify Cloud

```bash
apify login   # enter your Apify API token when prompted
apify push    # builds and deploys the actor to your Apify account
```

After deploying, open the Actor in [Apify Console](https://console.apify.com/actors) and fill in credentials via the UI — no `INPUT.json` needed on the cloud.
