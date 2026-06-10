
import { Actor } from 'apify';
import { CheerioCrawler, Dataset, log, LogLevel, gotScraping } from 'crawlee';
import * as cheerio from 'cheerio';
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';
import { KV_STORE_STATE } from './main.js';
import { deleteOldObjects, detectDocFramework, embedAndUpload, extractPageMetadata, generateEmbedding, normalizeUrl, shouldCrawlUrl, smartChunkText } from './utils.js';
import { PageMetadata } from './types.js';
import { createHash } from 'crypto';




//      PIPELINE 1: THE "WRITE" PATH
export async function  runIngestionPipeline(
    startUrl: string,
    maxRequests: number,
    client: WeaviateClient,
    className: string,
    openai: OpenAI,
    followLinks: boolean,
    extractMetadata: boolean,
    urlPatterns: string[],
    maxDepth: number,
) {
    // Open KV store for state management
    const stateStore = await Actor.openKeyValueStore(KV_STORE_STATE);

    // Extract base URL for link filtering
    const baseUrl = new URL(startUrl).origin;

    // Statistics tracking
    const stats = {
        processed: 0,
        skipped: 0,
        failed: 0,
        updated: 0,
        total: 0,  // set after URL discovery
    };

    // 1. DISCOVERY & FILTER 1 (Time-Based + Intelligent URL Discovery)
    // Get the date of the last successful run
    const globalState = await stateStore.getValue<{ lastRun: string }>('GLOBAL_STATE');
    const lastRunDate = globalState?.lastRun ? new Date(globalState.lastRun) : new Date(0); // Default to 1970 if new
    const currentRunDate = new Date();

    let targetUrls: string[] = [];

    // Normalize the start URL (handle both base URLs and sitemap URLs)
    const normalizedStartUrl = startUrl.replace(/\/$/, ''); // Remove trailing slash
    const isSitemapUrl = startUrl.toLowerCase().includes('sitemap') && startUrl.endsWith('.xml');

    if (isSitemapUrl) {
        // User provided a direct sitemap URL
        log.info(`🗺️ Fetching Sitemap: ${startUrl}`);
        log.info(`🕒 Filtering content modified after: ${lastRunDate.toISOString()}`);

        try {
            // Fetch sitemap content directly
            const { body } = await gotScraping({ url: startUrl });
            const $xml = cheerio.load(body, { xmlMode: true });

            targetUrls = []; // Reset targets

            $xml('url').each((_, el) => {
                const loc = $xml(el).find('loc').text();
                const lastmod = $xml(el).find('lastmod').text();

                if (!lastmod) {
                    // Safety: If no date exists, we must scrape it to be sure
                    targetUrls.push(loc);
                } else {
                    const modDate = new Date(lastmod);
                    // FILTER 1 LOGIC:
                    if (modDate > lastRunDate) {
                        log.info(`[NEW] Found update: ${loc} (LastMod: ${lastmod})`);
                        targetUrls.push(loc);
                    } else {
                        log.debug(`[OLD] Skipping ${loc}`);
                    }
                }
            });

            if (targetUrls.length === 0) {
                log.info('✅ No new content found in sitemap based on time filter.');
                // Update run time anyway so we don't get stuck in the past
                await stateStore.setValue('GLOBAL_STATE', { lastRun: currentRunDate.toISOString() });
                return;
            }

            log.info(`🚀 Queuing ${targetUrls.length} pages for scraping.`);
        } catch (e: any) {
            log.warning(`Failed to parse sitemap: ${e.message}. Fallback: Crawling startUrl directly.`);
            targetUrls = [startUrl];
        }
    } else {
        // User provided a base URL (e.g., nextjs.org, react.dev)
        log.info(`🌐 Base URL provided: ${normalizedStartUrl}`);
        log.info(`🔍 Starting intelligent documentation discovery...`);

        const { discoverSitemaps, extractUrlsFromSitemap, filterDocumentationUrls, intelligentDocDiscovery } = await import('./sitemapDiscovery.js');

        // Step 1: Try to discover sitemaps
        const discoveredSitemaps = await discoverSitemaps(normalizedStartUrl);

        if (discoveredSitemaps.length > 0) {
            // Step 2: Extract URLs from all discovered sitemaps
            const allSitemapUrls: string[] = [];
            for (const sitemapUrl of discoveredSitemaps) {
                const urls = await extractUrlsFromSitemap(sitemapUrl);
                allSitemapUrls.push(...urls);
            }

            // Step 3: Filter to only docs/blog/content URLs
            const docUrls = filterDocumentationUrls(allSitemapUrls, urlPatterns.length > 0 ? urlPatterns : ['docs', 'blog', 'content', 'guide', 'tutorial', 'api', 'reference', 'learn']);

            // Step 4: Apply time-based filtering if we have lastmod dates
            if (docUrls.length > 0) {
                log.info(`📄 Found ${docUrls.length} documentation URLs from sitemaps`);
                targetUrls = docUrls;
            }
        }

        // Step 5: If no sitemap or too few URLs, use intelligent discovery
        if (targetUrls.length < 10) {
            log.info(`⚠️ ${targetUrls.length} URLs from sitemaps. Using intelligent discovery...`);
            const discoveredUrls = await intelligentDocDiscovery(normalizedStartUrl, Math.min(maxRequests, 100));
            
            // Merge with sitemap URLs (avoid duplicates)
            const combined = [...new Set([...targetUrls, ...discoveredUrls])];
            targetUrls = combined;
        }

        // Step 6: Filter based on user-provided URL patterns if any
        if (urlPatterns.length > 0) {
            const filteredByPattern = targetUrls.filter(url => 
                urlPatterns.some(pattern => {
                    try {
                        const regex = new RegExp(pattern);
                        return regex.test(url) || url.includes(pattern);
                    } catch {
                        return url.includes(pattern);
                    }
                })
            );
            
            if (filteredByPattern.length > 0) {
                log.info(`🎯 Filtered by user patterns: ${targetUrls.length} → ${filteredByPattern.length} URLs`);
                targetUrls = filteredByPattern;
            }
        }

        // Step 7: Limit to maxRequests
        if (targetUrls.length > maxRequests) {
            log.warning(`⚠️ Found ${targetUrls.length} URLs, limiting to ${maxRequests} (increase maxRequestsPerCrawl for more)`);
            targetUrls = targetUrls.slice(0, maxRequests);
        }

        if (targetUrls.length === 0) {
            log.error('❌ No documentation URLs discovered. Check if the site has accessible documentation.');
            targetUrls = [normalizedStartUrl]; // Fallback to base URL
        }

        stats.total = targetUrls.length;
        log.info(`🚀 Queuing ${targetUrls.length} documentation pages for scraping.`);
    }

    // 2. SCRAPING & FILTER 2 (Hash-Based) + LINK DISCOVERY
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: maxRequests,
        maxConcurrency: 5,
        maxRequestRetries: 3, // Retry failed requests

        async requestHandler({ $, request, log: crawlerLog, enqueueLinks }) {
            const currentUrl = request.loadedUrl || request.url;
            const remaining = stats.total - stats.processed;
            crawlerLog.info(`[${stats.processed + 1}/${stats.total}] Processing (${remaining} left): ${currentUrl}`);
            stats.processed++;

            try {
                // A. Detect Documentation Framework
                const framework = detectDocFramework($);
                crawlerLog.debug(`Detected framework: ${framework.name}`);

                // B. Extract Metadata (if enabled)
                let metadata: PageMetadata | null = null;
                if (extractMetadata) {
                    metadata = extractPageMetadata($, currentUrl);
                    crawlerLog.debug(`Extracted metadata: ${metadata.title}`);
                }

                // C. Enhanced Content Extraction
                // Remove noise elements
                $(framework.excludeSelectors.join(', ')).remove();

                // Get main content using framework-specific selector
                const contentElement = $(framework.contentSelector);
                
                if (contentElement.length === 0) {
                    crawlerLog.warning(`No content found with selector: ${framework.contentSelector}`);
                    // Fallback to body
                    $('nav, footer, script, style, header, aside, .ad-banner, .sidebar, .cookie-notice').remove();
                }

                const mainContent = contentElement.length > 0 ? contentElement : $('body');

                // NEW: Extract structured content with code blocks preserved
                let structuredContent = '';
                const extractedCodeBlocks: string[] = [];
                
                // Process each element in the main content
                mainContent.find('*').addBack().each((_: any, elem: any) => {
                    const $elem = $(elem);
                    const tagName = elem.name?.toLowerCase();
                    
                    // Handle code blocks - preserve them with markers
                    if (tagName === 'pre' || tagName === 'code') {
                        const codeText = $elem.text().trim();
                        if (codeText.length > 10) {
                            const language = $elem.attr('class')?.match(/language-(\w+)/)?.[1] || 
                                           $elem.find('code').attr('class')?.match(/language-(\w+)/)?.[1] || 
                                           '';
                            const codeBlock = `\n[CODE:${language || 'text'}]\n${codeText}\n[/CODE]\n`;
                            extractedCodeBlocks.push(codeBlock);
                            $elem.replaceWith(`__CODE_BLOCK_${extractedCodeBlocks.length - 1}__`);
                        }
                    }
                    
                    // Handle headings - add structure markers
                    if (['h1', 'h2', 'h3', 'h4'].includes(tagName)) {
                        const heading = $elem.text().trim();
                        if (heading) {
                            $elem.replaceWith(`\n\n### ${heading} ###\n`);
                        }
                    }
                    
                    // Handle lists - preserve structure
                    if (tagName === 'li') {
                        const listItem = $elem.text().trim();
                        if (listItem) {
                            $elem.replaceWith(`\n• ${listItem}`);
                        }
                    }
                    
                    // Handle blockquotes, notes, warnings
                    if (tagName === 'blockquote' || $elem.hasClass('note') || $elem.hasClass('warning') || 
                        $elem.hasClass('important') || $elem.hasClass('tip')) {
                        const noteText = $elem.text().trim();
                        if (noteText) {
                            const noteType = $elem.hasClass('warning') ? 'WARNING' : 
                                           $elem.hasClass('important') ? 'IMPORTANT' : 
                                           $elem.hasClass('tip') ? 'TIP' : 'NOTE';
                            $elem.replaceWith(`\n[${noteType}] ${noteText}\n`);
                        }
                    }
                    
                    // Handle tables - extract data
                    if (tagName === 'table') {
                        let tableContent = '\n[TABLE]\n';
                        $elem.find('tr').each((_: any, row: any) => {
                            const cells = $(row).find('th, td').map((_: any, cell: any) => 
                                $(cell).text().trim()
                            ).get();
                            if (cells.length > 0) {
                                tableContent += cells.join(' | ') + '\n';
                            }
                        });
                        tableContent += '[/TABLE]\n';
                        $elem.replaceWith(tableContent);
                    }
                });

                // Get the processed text
                let cleanText = mainContent.text();
                
                // Restore code blocks
                extractedCodeBlocks.forEach((codeBlock, index) => {
                    cleanText = cleanText.replace(`__CODE_BLOCK_${index}__`, codeBlock);
                });

                // Normalize whitespace but preserve important breaks
                const formattedText = cleanText
                    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines to double
                    .replace(/[ \t]+/g, ' ') // Collapse spaces
                    .replace(/\n /g, '\n') // Remove leading spaces after newlines
                    .trim();

                if (!formattedText || formattedText.length < 50) {
                    crawlerLog.warning(`Skipping ${currentUrl}: Content too short.`);
                    stats.skipped++;
                    return;
                }

                crawlerLog.info(`Extracted ${formattedText.length} characters with ${extractedCodeBlocks.length} code blocks`);

                // D. Filter 2: Hash Gatekeeper (The Money Saver)
                const contentToHash = extractMetadata && metadata 
                    ? JSON.stringify({ text: formattedText, metadata, codeCount: extractedCodeBlocks.length })
                    : formattedText;
                    
                const newHash = createHash('sha256').update(contentToHash).digest('hex');
                const urlHash = createHash('md5').update(currentUrl).digest('hex'); // Safe key name
                const storeKey = `HASH_${urlHash}`;

                const oldHash = await stateStore.getValue<string>(storeKey);

                if (oldHash === newHash) {
                    crawlerLog.info(`[SKIP] Hash match (Content identical): ${currentUrl}`);
                    stats.skipped++;
                    return; // STOP: Money Saved.
                }

                crawlerLog.info(`[UPDATE] Content changed for ${currentUrl}. Re-indexing.`);
                stats.updated++;

                // E. Intelligent Chunking (Preserve Code Blocks and Structure)
                const chunks = smartChunkText(formattedText, 1500, metadata);

                // F. Clean Sweep (Delete Old)
                await deleteOldObjects(client, className, currentUrl);

                // G. Embedding & Upload
                await embedAndUpload(client, openai, className, chunks, currentUrl, metadata);

                // H. Update State
                await stateStore.setValue(storeKey, newHash);
                crawlerLog.info(`[SUCCESS] Indexing complete for ${currentUrl}`);

                // I. Link Discovery (if enabled)
                if (followLinks && request.userData?.depth !== undefined && request.userData.depth < maxDepth) {
                    await enqueueLinks({
                        globs: urlPatterns.length > 0 ? urlPatterns.map(p => `**${p}**`) : undefined,
                        strategy: 'same-domain',
                        transformRequestFunction: (req) => {
                            // Initialize userData if not present
                            if (!req.userData) {
                                req.userData = {};
                            }
                            
                            // Normalize URL
                            req.url = normalizeUrl(req.url, baseUrl);
                            
                            // Check if should crawl
                            if (!shouldCrawlUrl(req.url, urlPatterns, baseUrl)) {
                                return false;
                            }
                            
                            // Track depth
                            req.userData.depth = (request.userData?.depth || 0) + 1;
                            return req;
                        },
                    });
                }
            } catch (err: any) {
                crawlerLog.error(`Failed to process ${currentUrl}: ${err.message}`);
                stats.failed++;
            }

            // Log progress every 10 pages
            if (stats.processed % 10 === 0) {
                const remaining = stats.total - stats.processed;
                log.info(`📊 Progress: [${stats.processed}/${stats.total}] | Remaining=${remaining} | Updated=${stats.updated} | Skipped=${stats.skipped} | Failed=${stats.failed}`);
            }
        },

        failedRequestHandler({ request, log: crawlerLog }, error) {
            crawlerLog.error(`Request ${request.url} failed after retries: ${error.message}`);
            stats.failed++;
        },
    });

    // Mark initial URLs with depth 0
    const requestsWithDepth = targetUrls.map(url => ({
        url: normalizeUrl(url, baseUrl),
        userData: { depth: 0 },
    }));

    await crawler.run(requestsWithDepth);

    // Update Global Time State only after successful run
    await stateStore.setValue('GLOBAL_STATE', { lastRun: currentRunDate.toISOString() });
    
    log.info(`✅ Pipeline finished. Next run filter date: ${currentRunDate.toISOString()}`);
    log.info(`📊 Final Stats: Processed=${stats.processed}, Updated=${stats.updated}, Skipped=${stats.skipped}, Failed=${stats.failed}`);
}
