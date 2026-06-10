
// ==========================================
//           HELPER export FUNCTIONS
// ==========================================

import { WeaviateClient } from "weaviate-ts-client";
import { DocFramework, PageMetadata } from "./types.js";
import OpenAI from "openai";

// Detect Documentation Framework
export function detectDocFramework($: any): DocFramework {
    const html = $.html();
    
    // Docusaurus
    if (html.includes('docusaurus') || $('meta[name="generator"][content*="Docusaurus"]').length > 0) {
        return {
            name: 'Docusaurus',
            contentSelector: 'article, main, .markdown, [class*="docMainContainer"]',
            excludeSelectors: [
                'nav', 'footer', 'script', 'style', 'header', 'aside',
                '.navbar', '.sidebar', '.pagination', '.theme-doc-toc-mobile',
                '[class*="tocCollapsible"]', '.theme-doc-footer', '.theme-doc-breadcrumbs',
            ],
        };
    }
    
    // GitBook
    if (html.includes('gitbook') || $('[data-gitbook]').length > 0) {
        return {
            name: 'GitBook',
            contentSelector: '[data-gitbook-content], .page-inner, .markdown-section',
            excludeSelectors: [
                'nav', 'footer', 'script', 'style', 'header', 'aside',
                '.book-summary', '.book-header', '.navigation',
            ],
        };
    }
    
    // VuePress
    if ($('.theme-default-content, .vuepress-content').length > 0) {
        return {
            name: 'VuePress',
            contentSelector: '.theme-default-content, .vuepress-content, .content__default',
            excludeSelectors: [
                'nav', 'footer', 'script', 'style', 'header', 'aside',
                '.sidebar', '.navbar', '.page-nav',
            ],
        };
    }
    
    // MkDocs
    if (html.includes('mkdocs') || $('.md-content').length > 0) {
        return {
            name: 'MkDocs',
            contentSelector: '.md-content__inner, article',
            excludeSelectors: [
                'nav', 'footer', 'script', 'style', 'header', 'aside',
                '.md-sidebar', '.md-header', '.md-footer',
            ],
        };
    }
    
    // ReadTheDocs / Sphinx
    if ($('.rst-content, .document').length > 0 || html.includes('sphinx')) {
        return {
            name: 'Sphinx',
            contentSelector: '.rst-content, .document, [role="main"]',
            excludeSelectors: [
                'nav', 'footer', 'script', 'style', 'header', 'aside',
                '.wy-nav-side', '.wy-nav-top', '.rst-footer-buttons',
            ],
        };
    }
    
    // Generic/Unknown
    return {
        name: 'Generic',
        contentSelector: 'main, article, [role="main"], .content, .documentation',
        excludeSelectors: [
            'nav', 'footer', 'script', 'style', 'header', 'aside',
            '.sidebar', '.navigation', '.ad-banner', '.cookie-notice',
            '[class*="advertisement"]', '[id*="cookie"]',
        ],
    };
}

// Extract Page Metadata
export function extractPageMetadata($: any, url: string): PageMetadata {
    // Extract title
    let title = $('h1').first().text().trim();
    if (!title) {
        title = $('title').text().trim();
    }
    if (!title) {
        title = $('meta[property="og:title"]').attr('content') || '';
    }
    
    // Extract description
    let description = $('meta[name="description"]').attr('content') || '';
    if (!description) {
        description = $('meta[property="og:description"]').attr('content') || '';
    }
    if (!description) {
        description = $('p').first().text().trim().substring(0, 200);
    }
    
    // Extract headings (h1, h2, h3)
    const headings: string[] = [];
    $('h1, h2, h3').each((_: any, el: any) => {
        const heading = $(el).text().trim();
        if (heading && !headings.includes(heading)) {
            headings.push(heading);
        }
    });
    
    // Extract code blocks
    const codeBlocks: Array<{ language: string; code: string }> = [];
    $('pre code, code[class*="language-"], .highlight code').each((_: any, el: any) => {
        const $code = $(el);
        const code = $code.text().trim();
        
        // Try to detect language from class
        let language = '';
        const classAttr = $code.attr('class') || $code.parent().attr('class') || '';
        const langMatch = classAttr.match(/language-(\w+)|lang-(\w+)|highlight-(\w+)/);
        if (langMatch) {
            language = langMatch[1] || langMatch[2] || langMatch[3] || '';
        }
        
        if (code && code.length > 10 && code.length < 5000) {
            codeBlocks.push({ language, code });
        }
    });
    
    // Extract URL path
    const urlPath = new URL(url).pathname;
    
    return {
        title: title || 'Untitled',
        description: description.substring(0, 500), // Limit description length
        headings: headings.slice(0, 20), // Limit to first 20 headings
        codeBlocks: codeBlocks.slice(0, 10), // Limit to first 10 code blocks
        urlPath,
        lastScraped: new Date().toISOString(),
    };
}

// Normalize URL
export function normalizeUrl(url: string, baseUrl: string): string {
    try {
        const parsed = new URL(url, baseUrl);
        
        // Remove common tracking parameters
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
        paramsToRemove.forEach(param => parsed.searchParams.delete(param));
        
        // Remove hash (unless it's important for navigation)
        // Keep hashes that look like they're part of SPA routing
        if (parsed.hash && !parsed.hash.match(/^#\/?[a-zA-Z0-9-_/]+$/)) {
            parsed.hash = '';
        }
        
        // Normalize trailing slash
        if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }
        
        return parsed.toString();
    } catch {
        return url; // Return original if parsing fails
    }
}

// Determine if URL should be crawled
export function shouldCrawlUrl(url: string, patterns: string[], baseUrl: string): boolean {
    try {
        const parsed = new URL(url);
        const baseParsed = new URL(baseUrl);
        
        // Must be same domain
        if (parsed.hostname !== baseParsed.hostname) {
            return false;
        }
        
        // Exclude common file extensions
        const excludeExtensions = [
            '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
            '.css', '.js', '.json', '.xml', '.zip', '.tar', '.gz',
            '.mp4', '.mp3', '.avi', '.mov', '.woff', '.woff2', '.ttf', '.eot',
        ];
        
        if (excludeExtensions.some(ext => parsed.pathname.toLowerCase().endsWith(ext))) {
            return false;
        }
        
        // If patterns provided, URL must match at least one
        if (patterns.length > 0) {
            return patterns.some(pattern => {
                try {
                    const regex = new RegExp(pattern);
                    return regex.test(url) || url.includes(pattern);
                } catch {
                    return url.includes(pattern);
                }
            });
        }
        
        return true;
    } catch {
        return false;
    }
}

// Smart Chunking: Preserves paragraphs and code blocks
export function smartChunkText(text: string, maxChars: number, _metadata: PageMetadata | null = null): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        if (para.length > maxChars) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            const subChunks = para.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [para];
            chunks.push(...subChunks);
        } else {
            currentChunk += para + '\n\n';
        }
    }
    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
    return chunks;
}

export async  function deleteOldObjects(client: WeaviateClient, className: string, url: string) {
    try {
        await client.batch
            .objectsBatchDeleter()
            .withClassName(className)
            .withWhere({ path: ['source_url'], operator: 'Equal', valueString: url })
            .do();
    } catch (e) {}
}

export async  function embedAndUpload(
    client: WeaviateClient,
    openai: OpenAI,
    className: string,
    chunks: string[],
    url: string,
    metadata: PageMetadata | null = null,
) {
    const batcher = client.batch.objectsBatcher();
    let batchCounter = 0;
    for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const vector = await generateEmbedding(openai, text);
        
        const properties: any = {
            content: text,
            source_url: url,
            chunk_index: i,
        };
        
        // Extract code blocks from this chunk with context
        const codeBlocksInChunk = extractCodeBlocksFromContent(text);
        
        // Add metadata if available
        if (metadata) {
            properties.title = metadata.title;
            properties.description = metadata.description;
            properties.url_path = metadata.urlPath;
            properties.last_scraped = metadata.lastScraped;
            
            // Store headings as a single string
            if (metadata.headings.length > 0) {
                properties.headings = metadata.headings.join(' | ');
            }
            
            // Store code blocks (track if ANY code blocks exist)
            if (metadata.codeBlocks.length > 0 || codeBlocksInChunk.length > 0) {
                properties.has_code = true;
                
                // Collect languages
                const allLanguages = [
                    ...metadata.codeBlocks.map(cb => cb.language).filter(l => l),
                    ...codeBlocksInChunk.map(cb => cb.language).filter(l => l)
                ];
                properties.code_languages = [...new Set(allLanguages)].join(', ');
                
                // Store code blocks with context as JSON string
                if (codeBlocksInChunk.length > 0) {
                    properties.code_blocks_json = JSON.stringify(codeBlocksInChunk);
                }
            }
        }
        
        batcher.withObject({
            class: className,
            properties,
            vector: vector,
        });
        batchCounter++;
        if (batchCounter >= 20) {
            await batcher.do();
            batchCounter = 0;
        }
    }
    if (batchCounter > 0) await batcher.do();
}

/**
 * Extracts code blocks from content with their surrounding context
 */
function extractCodeBlocksFromContent(content: string): Array<{ language: string; code: string; context: string }> {
    const codeBlocks: Array<{ language: string; code: string; context: string }> = [];
    
    // Match code blocks with [CODE:lang] markers
    const codeRegex = /\[CODE:(\w+)\]\n([\s\S]*?)\n\[\/CODE\]/g;
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
        const language = match[1] || 'text';
        const code = match[2].trim();
        
        // Find context (preceding heading or paragraph)
        const beforeCode = content.substring(0, match.index);
        const lines = beforeCode.split('\n').reverse();
        
        // Look for the nearest heading or descriptive text
        let context = '';
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('###')) {
                // Found a heading
                context = trimmedLine.replace(/###/g, '').trim();
                break;
            } else if (trimmedLine.length > 20 && !trimmedLine.includes('[CODE:')) {
                // Found descriptive text
                context = trimmedLine.substring(0, 150);
                break;
            }
        }
        
        if (code.length > 10) { // Only include substantial code blocks
            codeBlocks.push({
                language,
                code: code.substring(0, 1000), // Limit code length
                context: context || 'Code example'
            });
        }
    }
    
    return codeBlocks;
}

export async  function generateEmbedding(openai: OpenAI, text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
}
