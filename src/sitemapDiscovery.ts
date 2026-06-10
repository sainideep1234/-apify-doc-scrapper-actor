// ==========================================
//      SITEMAP DISCOVERY & URL EXTRACTION
// ==========================================

import { gotScraping } from 'crawlee';
import * as cheerio from 'cheerio';
import { log } from 'crawlee';

/**
 * Attempts to discover sitemaps from a base URL
 * Tries common sitemap patterns and robots.txt
 */
export async function discoverSitemaps(baseUrl: string): Promise<string[]> {
    const normalizedBase = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const sitemapUrls: string[] = [];

    // Common sitemap patterns to try
    const commonPatterns = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap-index.xml',
        '/sitemap/sitemap.xml',
        '/sitemap/sitemap-index.xml',
        '/docs/sitemap.xml',
        '/blog/sitemap.xml',
        '/wp-sitemap.xml', // WordPress
        '/post-sitemap.xml',
        '/page-sitemap.xml',
        '/sitemap1.xml',
    ];

    log.info('🔍 Discovering sitemaps...');

    // 1. Try robots.txt first
    try {
        const robotsUrl = `${normalizedBase}/robots.txt`;
        log.info(`Checking robots.txt: ${robotsUrl}`);
        const { body } = await gotScraping({ url: robotsUrl });
        
        const sitemapMatches = body.match(/Sitemap:\s*(.+)/gi);
        if (sitemapMatches) {
            sitemapMatches.forEach((match) => {
                const url = match.replace(/Sitemap:\s*/i, '').trim();
                if (url && !sitemapUrls.includes(url)) {
                    sitemapUrls.push(url);
                    log.info(`✅ Found sitemap in robots.txt: ${url}`);
                }
            });
        }
    } catch (e) {
        log.warning('Could not fetch robots.txt, continuing with common patterns...');
    }

    // 2. Try common sitemap patterns
    for (const pattern of commonPatterns) {
        const sitemapUrl = `${normalizedBase}${pattern}`;
        try {
            const response = await gotScraping({ url: sitemapUrl, throwHttpErrors: false });
            
            if (response.statusCode === 200) {
                if (!sitemapUrls.includes(sitemapUrl)) {
                    sitemapUrls.push(sitemapUrl);
                    log.info(`✅ Found sitemap: ${sitemapUrl}`);
                }
            }
        } catch (e) {
            // Silently continue
        }
    }

    if (sitemapUrls.length === 0) {
        log.warning('⚠️ No sitemaps found. Will use intelligent crawling.');
    } else {
        log.info(`📋 Discovered ${sitemapUrls.length} sitemap(s)`);
    }

    return sitemapUrls;
}

/**
 * Extracts URLs from a sitemap (handles nested sitemaps)
 */
export async function extractUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
    const urls: string[] = [];
    const processedSitemaps = new Set<string>();

    async function processSitemap(url: string): Promise<void> {
        if (processedSitemaps.has(url)) return;
        processedSitemaps.add(url);

        try {
            const { body } = await gotScraping({ url });
            const $xml = cheerio.load(body, { xmlMode: true });

            // Check if it's a sitemap index (contains other sitemaps)
            const nestedSitemaps = $xml('sitemap > loc');
            if (nestedSitemaps.length > 0) {
                log.info(`📂 Found sitemap index with ${nestedSitemaps.length} nested sitemaps`);
                
                for (let i = 0; i < nestedSitemaps.length; i++) {
                    const nestedUrl = $xml(nestedSitemaps[i]).text();
                    if (nestedUrl) {
                        await processSitemap(nestedUrl);
                    }
                }
            }

            // Extract actual page URLs
            const pageUrls = $xml('url > loc');
            pageUrls.each((_: number, el: any) => {
                const loc = $xml(el).text();
                if (loc && !urls.includes(loc)) {
                    urls.push(loc);
                }
            });

        } catch (e: any) {
            log.warning(`Failed to process sitemap ${url}: ${e.message}`);
        }
    }

    await processSitemap(sitemapUrl);
    log.info(`📄 Extracted ${urls.length} URLs from sitemap`);
    return urls;
}

/**
 * Filters URLs to only include docs/blog/content pages
 */
export function filterDocumentationUrls(urls: string[], keywords: string[] = ['docs', 'blog', 'content', 'guide', 'tutorial', 'api', 'reference']): string[] {
    const filtered = urls.filter(url => {
        const urlLower = url.toLowerCase();
        
        // Must contain at least one keyword
        const hasKeyword = keywords.some(keyword => urlLower.includes(`/${keyword}/`) || urlLower.includes(`/${keyword}`));
        
        // Exclude common non-documentation pages
        const excludePatterns = [
            '/privacy', '/terms', '/legal', '/careers', '/jobs',
            '/pricing', '/contact', '/about-us', '/team',
            '/login', '/signup', '/register', '/checkout',
            '.pdf', '.jpg', '.png', '.gif', '.mp4', '.zip'
        ];
        
        const isExcluded = excludePatterns.some(pattern => urlLower.includes(pattern));
        
        return hasKeyword && !isExcluded;
    });

    log.info(`🎯 Filtered ${urls.length} URLs → ${filtered.length} documentation URLs`);
    return filtered;
}

/**
 * Discovers documentation URLs through intelligent crawling
 * Starts from homepage and finds doc/blog/content links
 */
export async function intelligentDocDiscovery(baseUrl: string, maxPages: number = 50): Promise<string[]> {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const discoveredUrls = new Set<string>();
    const toVisit = new Set<string>([normalizedBase]);
    const visited = new Set<string>();

    log.info('🧠 Starting intelligent documentation discovery...');

    while (toVisit.size > 0 && visited.size < maxPages) {
        const url = Array.from(toVisit)[0];
        toVisit.delete(url);

        if (visited.has(url)) continue;
        visited.add(url);

        try {
            log.info(`Scanning: ${url}`);
            const { body } = await gotScraping({ url });
            const $ = cheerio.load(body);

            // Find all links
            $('a[href]').each((_: number, el: any) => {
                const href = $(el).attr('href');
                if (!href) return;

                try {
                    const absoluteUrl = new URL(href, url).toString();
                    const urlObj = new URL(absoluteUrl);

                    // Must be same domain
                    if (urlObj.hostname !== new URL(normalizedBase).hostname) return;

                    const path = urlObj.pathname.toLowerCase();

                    // Check if it's a documentation-related URL
                    const docKeywords = ['docs', 'blog', 'content', 'guide', 'tutorial', 'learn', 'api', 'reference', 'documentation'];
                    const hasDocKeyword = docKeywords.some(kw => path.includes(`/${kw}/`) || path.includes(`/${kw}`));

                    if (hasDocKeyword) {
                        discoveredUrls.add(absoluteUrl);
                        
                        // Also add to toVisit to crawl further (only if it's a section page)
                        if (visited.size < maxPages && path.split('/').length <= 4) {
                            toVisit.add(absoluteUrl);
                        }
                    }
                } catch (e) {
                    // Invalid URL, skip
                }
            });

        } catch (e: any) {
            log.warning(`Failed to scan ${url}: ${e.message}`);
        }
    }

    const urls = Array.from(discoveredUrls);
    log.info(`🎯 Discovered ${urls.length} documentation URLs through intelligent crawling`);
    return urls;
}
