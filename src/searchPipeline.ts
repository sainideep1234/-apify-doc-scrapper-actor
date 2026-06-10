
import { Actor } from 'apify';
import { CheerioCrawler, Dataset, log, LogLevel, gotScraping } from 'crawlee';
import * as cheerio from 'cheerio';
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';
import { KV_STORE_STATE } from './main.js';
import { deleteOldObjects, detectDocFramework, embedAndUpload, extractPageMetadata, generateEmbedding, normalizeUrl, shouldCrawlUrl, smartChunkText } from './utils.js';
import { PageMetadata } from './types.js';
import { createHash } from 'crypto';


// ==========================================
//      PIPELINE 2: THE "READ" PATH
// ==========================================
export async function runRetrievalPipeline(
    userQuery: string,
    useSmallLLM: boolean,
    client: WeaviateClient,
    className: string,
    openai: OpenAI,
    sourceFilter?: string, // Domain to filter results (e.g., 'stripe.com')
) {
    // Safety Check for Class Existence
    try {
        const schema = await client.schema.getter().do();
        const classExists = schema.classes?.some((c: any) => c.class === className);
        if (!classExists) {
            log.error(`❌ Class '${className}' not found. Run INGEST mode first.`);
            return;
        }
    } catch (e) {
        /* Ignore network errors here */
    }

    let vectorSearchQuery = userQuery;

    // 1. Expansion (Small LLM)
    if (useSmallLLM) {
        log.info('🧠 Expanding Query with Small LLM...');
        try {
            const expansion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a technical assistant. Provide a 1-sentence explanation of the user query to add context. Do not answer the question directly, just expand on the concepts.',
                    },
                    { role: 'user', content: userQuery },
                ],
            });

            const expandedContext = expansion.choices[0]?.message?.content || '';
            log.info(`Expanded Context: "${expandedContext}"`);

            // Vectorize the Expanded Context
            vectorSearchQuery = `${userQuery} ${expandedContext}`;
        } catch (e: any) {
            log.warning(`Expansion failed: ${e.message}`);
        }
    }

    // 2. Vectorize
    const embedding = await generateEmbedding(openai, vectorSearchQuery);

    // 3. Hybrid Search with Enhanced Fields and Source Filtering
    log.info('🔍 Executing Hybrid Search...');
    
    if (sourceFilter) {
        log.info(`🎯 Filtering results by source: ${sourceFilter}`);
    }
    
    try {
        // Build the base query
        let query = client.graphql
            .get()
            .withClassName(className)
            .withHybrid({
                query: userQuery, // Raw Query (BM25)
                vector: embedding, // Expanded Vector (Context)
                alpha: 0.5, // Equal Weight
            })
            .withLimit(5)
            .withFields('content source_url chunk_index title description headings has_code code_languages code_blocks_json url_path last_scraped');

        // Add source filter if provided
        if (sourceFilter) {
            query = query.withWhere({
                path: ['source_url'],
                operator: 'Like',
                valueText: `*${sourceFilter}*`
            });
        }

        const response = await query.do();

        const results = response.data.Get[className];
        
        if (!results || results.length === 0) {
            log.warning(`⚠️ No results found for the query${sourceFilter ? ` from ${sourceFilter}` : ''}.`);
            await Dataset.pushData({ 
                originalQuery: userQuery, 
                expandedQuery: vectorSearchQuery,
                sourceFilter: sourceFilter || 'all',
                resultsCount: 0,
                results: [] 
            });
            return;
        }

        // Enhanced data structure for UI display with better formatting
        const enrichedResults = results.map((result: any, index: number) => {
            // Check if content contains code blocks
            const hasCodeBlocks = result.content?.includes('[CODE:') || result.has_code;
            const codeLanguages = result.code_languages || '';
            
            // Parse stored code blocks JSON
            let parsedCodeBlocks: Array<{ language: string; code: string; context: string }> = [];
            if (result.code_blocks_json) {
                try {
                    parsedCodeBlocks = JSON.parse(result.code_blocks_json);
                } catch (e) {
                    // Ignore parse errors
                }
            }
            
            // Fallback: Extract from content if no stored code blocks
            if (parsedCodeBlocks.length === 0 && result.content?.includes('[CODE:')) {
                const codeMatches = result.content.match(/\[CODE:(\w+)\]\n([\s\S]*?)\n\[\/CODE\]/g) || [];
                parsedCodeBlocks = codeMatches.map((match: string) => {
                    const langMatch = match.match(/\[CODE:(\w+)\]/);
                    const codeMatch = match.match(/\[CODE:\w+\]\n([\s\S]*?)\n\[\/CODE\]/);
                    return {
                        language: langMatch?.[1] || 'text',
                        code: codeMatch?.[1]?.substring(0, 500) || '',
                        context: 'Code example'
                    };
                });
            }

            return {
                rank: index + 1,
                content: result.content || 'N/A',
                source_url: result.source_url || 'N/A',
                chunk_index: result.chunk_index || 0,
                title: result.title || 'Untitled',
                description: result.description || '',
                headings: result.headings ? result.headings.split(' | ') : [],
                has_code: hasCodeBlocks,
                code_languages: codeLanguages,
                code_snippets: parsedCodeBlocks, // Now properly populated!
                url_path: result.url_path || '',
                last_scraped: result.last_scraped || ''
            };
        });

        await Dataset.pushData({ 
            originalQuery: userQuery,
            expandedQuery: vectorSearchQuery,
            sourceFilter: sourceFilter || 'all',
            resultsCount: enrichedResults.length,
            timestamp: new Date().toISOString(),
            results: enrichedResults
        });
        
        log.info(`✅ Found ${enrichedResults.length} results${sourceFilter ? ` from ${sourceFilter}` : ''} for query: "${userQuery}"`);
        log.info('📄 Top Result Preview:');
        log.info(`   Title: ${enrichedResults[0].title}`);
        log.info(`   URL: ${enrichedResults[0].source_url}`);
        log.info(`   Has Code: ${enrichedResults[0].has_code ? 'Yes' : 'No'}`);
        if (enrichedResults[0].code_snippets?.length > 0) {
            log.info(`   Code Languages: ${enrichedResults[0].code_snippets.map((c: any) => c.language).join(', ')}`);
        }
        log.info(`   Content Preview: ${enrichedResults[0].content.substring(0, 200).replace(/\n/g, ' ')}...`);
    } catch (e: any) {
        log.exception(e, 'Search failed');
    }
}



