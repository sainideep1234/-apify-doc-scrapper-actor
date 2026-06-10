
import { Actor } from 'apify';
import { CheerioCrawler, Dataset, log, LogLevel, gotScraping } from 'crawlee';
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';
import { InputSchema } from './types.js';
import { runIngestionPipeline } from './fetchpipeline.js';
import { runRetrievalPipeline } from './searchPipeline.js';


// --- CONSTANTS ---
export const KV_STORE_STATE = 'SITEMAP_STATE';
export const DEFAULT_CLASS = 'Documentation';

// --- MAIN ACTOR LOGIC ---

await Actor.init();

try {
    const input = await Actor.getInput<InputSchema>();
    if (!input) throw new Error('Input is missing!');

    const {
        mode,
        sitemapUrl,
        query,
        useSmallLLM = false,
        filterBySource,
        maxRequestsPerCrawl = 100,
        followLinks = true,
        extractMetadata = true,
        urlPatterns = [],
        maxDepth = 3,
        respectRobotsTxt = true,
        debugLog = false,
        weaviateHost = process.env.WEAVIATE_HOST,
        weaviateApiKey = process.env.WEAVIATE_API_KEY,
        weaviateClass = input.weaviateClass || DEFAULT_CLASS,
        openaiApiKey = process.env.OPENAI_API_KEY,
    } = input;

    // if (debugLog) log.setLevel(LogLevel.DEBUG);

    if (!weaviateHost || !weaviateApiKey || !openaiApiKey) {
        throw new Error('Missing Config: WEAVIATE_HOST, WEAVIATE_API_KEY, and OPENAI_API_KEY are required.');
    }

    // Initialize Clients
    const clientFactory = (weaviate as any).client || (weaviate as any).default?.client;
    const weaviateClient: WeaviateClient = clientFactory({
        scheme: 'https',
        host: weaviateHost,
        apiKey: new ApiKey(weaviateApiKey),
        headers: { 'X-OpenAI-Api-Key': openaiApiKey },
    });
    const openai = new OpenAI({ apiKey: openaiApiKey });

    log.info(`🚀 Starting Actor in ${mode} mode`);

    if (mode === 'INGEST') {
        if (!sitemapUrl) throw new Error('INGEST mode requires "sitemapUrl".');
        await runIngestionPipeline(
            sitemapUrl,
            maxRequestsPerCrawl,
            weaviateClient,
            weaviateClass,
            openai,
            followLinks,
            extractMetadata,
            urlPatterns,
            maxDepth,
        );
    } else if (mode === 'SEARCH') {
        if (!query) throw new Error('SEARCH mode requires "query".');
        
        // Auto-extract source domain if sitemapUrl is provided but filterBySource is not
        let sourceFilter = filterBySource;
        if (!sourceFilter && sitemapUrl) {
            try {
                const urlObj = new URL(sitemapUrl);
                sourceFilter = urlObj.hostname;
                log.info(`🎯 Auto-filtering search by source: ${sourceFilter}`);
            } catch (e) {
                // Invalid URL, ignore
            }
        }
        
        await runRetrievalPipeline(query, useSmallLLM, weaviateClient, weaviateClass, openai, sourceFilter);
    }
} catch (error: any) {
    log.exception(error, 'Actor execution failed');
    throw error;
} finally {
    await Actor.exit();
}


