// --- INTERFACES ---

export interface InputSchema {
    mode: 'INGEST' | 'SEARCH';
    // Ingest Inputs
    sitemapUrl?: string;
    maxRequestsPerCrawl?: number;
    followLinks?: boolean; // Enable automatic link discovery
    extractMetadata?: boolean; // Extract titles, headings, code blocks
    urlPatterns?: string[]; // Regex patterns to filter URLs (e.g., ['/docs/', '/guide/'])
    maxDepth?: number; // Maximum crawl depth from start URL
    respectRobotsTxt?: boolean; // Respect robots.txt rules

    // Search Inputs
    query?: string;
    useSmallLLM?: boolean;
    filterBySource?: string; // Filter search results by source domain (e.g., 'stripe.com', 'nextjs.org')

    // Config
    debugLog?: boolean;
    weaviateHost?: string;
    weaviateApiKey?: string;
    openaiApiKey?: string;
    weaviateClass?: string;
}

export interface PageMetadata {
    title: string;
    description: string;
    headings: string[];
    codeBlocks: Array<{ language: string; code: string }>;
    urlPath: string;
    lastScraped: string;
}

export interface DocFramework {
    name: string;
    contentSelector: string;
    excludeSelectors: string[];
}
