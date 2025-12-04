import { Client } from '@notionhq/client';
import logger from './logger.js';
// Legacy imports (kept for backwards compatibility)
// import type { ScrapedContent } from './scraper.js';
import type { TranslatedContent } from './translator.js';

export interface NotionEntry {
  scrapedDate: Date;
  url: string;
  titleEn: string;
  titleFr: string;
  contentEn: string;
  contentFr: string;
  author?: string;
  publishedDate?: Date;
  status: 'success' | 'error';
  wordCount: number;
  errorMessage?: string;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;

/**
 * Initialize Notion client
 */
function getNotionClient(): Client {
  const apiKey = process.env.NOTION_API_KEY;

  if (!apiKey) {
    throw new Error('NOTION_API_KEY environment variable is not set');
  }

  return new Client({ auth: apiKey });
}

/**
 * Get or validate database ID
 */
function getDatabaseId(): string {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    throw new Error('NOTION_DATABASE_ID environment variable is not set');
  }

  return databaseId;
}

/**
 * Truncate text to fit Notion's limits
 * Rich text: 2000 characters per block
 */
function truncateText(text: string, maxLength: number = 2000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Split long text into multiple rich text blocks
 */
function splitIntoRichTextBlocks(text: string, maxLength: number = 2000): Array<{ text: { content: string } }> {
  if (text.length <= maxLength) {
    return [{ text: { content: text } }];
  }

  const blocks: Array<{ text: { content: string } }> = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    const chunk = remainingText.slice(0, maxLength);
    blocks.push({ text: { content: chunk } });
    remainingText = remainingText.slice(maxLength);
  }

  return blocks;
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempt: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
      logger.warn(`Notion API retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`, {
        error: error.message,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, attempt + 1);
    }
    throw error;
  }
}

/**
 * Create a new page in Notion database
 */
export async function createNotionEntry(entry: NotionEntry): Promise<string> {
  const notion = getNotionClient();
  const databaseId = getDatabaseId();

  try {
    logger.info('Creating Notion entry', {
      url: entry.url,
      status: entry.status,
    });

    const response = await retryWithBackoff(async () => {
      return await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          // Title (required by Notion)
          'Name': {
            title: [
              {
                text: {
                  content: truncateText(entry.titleEn, 200),
                },
              },
            ],
          },
          // Date of scraping
          'Date': {
            date: {
              start: entry.scrapedDate.toISOString(),
            },
          },
          // Source URL
          'URL': {
            url: entry.url,
          },
          // Title (EN)
          'Titre EN': {
            rich_text: [
              {
                text: {
                  content: truncateText(entry.titleEn, 2000),
                },
              },
            ],
          },
          // Title (FR)
          'Titre FR': {
            rich_text: [
              {
                text: {
                  content: truncateText(entry.titleFr, 2000),
                },
              },
            ],
          },
          // Author (optional)
          ...(entry.author && {
            'Auteur': {
              rich_text: [
                {
                  text: {
                    content: truncateText(entry.author, 2000),
                  },
                },
              ],
            },
          }),
          // Published date (optional)
          ...(entry.publishedDate && {
            'Date publication': {
              date: {
                start: entry.publishedDate.toISOString(),
              },
            },
          }),
          // Status
          'Statut': {
            select: {
              name: entry.status,
            },
          },
          // Word count
          'Word count': {
            number: entry.wordCount,
          },
          // Error message (if status is error)
          ...(entry.errorMessage && {
            'Erreur': {
              rich_text: [
                {
                  text: {
                    content: truncateText(entry.errorMessage, 2000),
                  },
                },
              ],
            },
          }),
          // Content EN (rich text - truncated to first 2000 chars for property)
          'Contenu EN': {
            rich_text: [
              {
                text: {
                  content: truncateText(entry.contentEn, 2000),
                },
              },
            ],
          },
          // Content FR (rich text - truncated to first 2000 chars for property)
          'Contenu FR': {
            rich_text: [
              {
                text: {
                  content: truncateText(entry.contentFr, 2000),
                },
              },
            ],
          },
        },
        // Add full content as page content (blocks)
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  text: {
                    content: 'Contenu Original (EN)',
                  },
                },
              ],
            },
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: splitIntoRichTextBlocks(entry.contentEn, 2000),
            },
          },
          {
            object: 'block',
            type: 'divider',
            divider: {},
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  text: {
                    content: 'Contenu Traduit (FR)',
                  },
                },
              ],
            },
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: splitIntoRichTextBlocks(entry.contentFr, 2000),
            },
          },
        ],
      });
    });

    logger.info('Notion entry created successfully', {
      pageId: response.id,
      url: entry.url,
    });

    return response.id;
  } catch (error: any) {
    logger.error('Failed to create Notion entry', {
      error: error.message,
      code: error.code,
      url: entry.url,
    });
    throw error;
  }
}

/**
 * Test Notion connection and database access
 */
export async function testNotionConnection(): Promise<boolean> {
  try {
    const notion = getNotionClient();
    const databaseId = getDatabaseId();

    logger.info('Testing Notion connection', { databaseId });

    // Try to retrieve database
    const database = await notion.databases.retrieve({ database_id: databaseId });

    logger.info('Notion connection successful', {
      databaseId: database.id,
      title: (database as any).title?.[0]?.plain_text || 'Untitled',
    });

    return true;
  } catch (error: any) {
    logger.error('Notion connection failed', {
      error: error.message,
      code: error.code,
    });
    return false;
  }
}

/**
 * Create entry from scraped and translated content (Legacy - for old scraper)
 */
export async function createEntryFromScrapedContent(
  scraped: any, // ScrapedContent
  titleTranslation: TranslatedContent,
  contentTranslation: TranslatedContent
): Promise<string> {
  const entry: NotionEntry = {
    scrapedDate: scraped.scrapedAt,
    url: scraped.url,
    titleEn: scraped.title,
    titleFr: titleTranslation.translated,
    contentEn: scraped.content,
    contentFr: contentTranslation.translated,
    author: scraped.author,
    publishedDate: scraped.publishedDate,
    status: 'success',
    wordCount: scraped.wordCount,
  };

  return await createNotionEntry(entry);
}

/**
 * Create error entry when scraping/translation fails
 */
export async function createErrorEntry(
  url: string,
  errorMessage: string
): Promise<string> {
  const entry: NotionEntry = {
    scrapedDate: new Date(),
    url,
    titleEn: 'Error',
    titleFr: 'Erreur',
    contentEn: '',
    contentFr: '',
    status: 'error',
    wordCount: 0,
    errorMessage,
  };

  return await createNotionEntry(entry);
}

/**
 * Create IdeaBrowser entry in Notion with 42 properties
 */
export async function createIdeaBrowserEntry(
  original: any, // IdeaBrowserContent
  translated: any, // Translated content
  translationMetadata: any
): Promise<string> {
  const notion = getNotionClient();
  const databaseId = getDatabaseId();

  try {
    logger.info('Creating IdeaBrowser Notion entry', {
      title: original.title,
      keywordsCount: original.keywords?.length || 0
    });

    // Helper to create rich text property
    const richText = (text: string) => ({
      rich_text: [{ text: { content: truncateText(text, 2000) } }]
    });

    // Helper to create multi-select from keywords
    const keywordMultiSelect = original.keywords?.slice(0, 20).map((kw: any) => ({
      name: kw.name.substring(0, 100) // Notion multi-select has 100 char limit
    })) || [];

    const response = await retryWithBackoff(async () => {
      return await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          // Groupe : Général (6)
          'Name': {
            title: [{ text: { content: truncateText(original.title, 200) } }]
          },
          'Date scraping': {
            date: { start: new Date(original.scrapedAt).toISOString() }
          },
          ...(original.publishedDate && {
            'Date publication': {
              date: { start: new Date(original.publishedDate).toISOString() }
            }
          }),
          'URL': {
            url: original.url
          },
          'Statut': {
            select: { name: 'success' }
          },
          ...(original.openGraph?.image && {
            'Image Preview': {
              url: original.openGraph.image
            }
          }),

          // Groupe : Business Fit EN (7)
          'Opportunities EN': richText(original.businessFit?.opportunities || ''),
          'Problems EN': richText(original.businessFit?.problems || ''),
          'Why Now EN': richText(original.businessFit?.whyNow || ''),
          'Feasibility EN': richText(original.businessFit?.feasibility || ''),
          'Revenue Potential EN': richText(original.businessFit?.revenuePotential || ''),
          'Execution Difficulty EN': richText(original.businessFit?.executionDifficulty || ''),
          'Go-to-Market EN': richText(original.businessFit?.goToMarket || ''),

          // Groupe : Business Fit FR (7)
          'Opportunités FR': richText(translated.businessFit?.opportunities || ''),
          'Problèmes FR': richText(translated.businessFit?.problems || ''),
          'Pourquoi Maintenant FR': richText(translated.businessFit?.whyNow || ''),
          'Faisabilité FR': richText(translated.businessFit?.feasibility || ''),
          'Potentiel Revenus FR': richText(translated.businessFit?.revenuePotential || ''),
          'Difficulté Exécution FR': richText(translated.businessFit?.executionDifficulty || ''),
          'Go-to-Market FR': richText(translated.businessFit?.goToMarket || ''),

          // Groupe : Keywords (6)
          'Keywords': {
            multi_select: keywordMultiSelect
          },
          'Top Keyword': {
            rich_text: [{
              text: {
                content: original.keywords?.[0]?.name || 'N/A'
              }
            }]
          },
          'Keywords Count': {
            number: original.metadata?.keywordsCount || 0
          },
          'Avg Keyword Volume': {
            number: original.metadata?.avgKeywordVolume || 0
          },
          'High Growth Keywords': {
            number: original.metadata?.highGrowthKeywordsCount || 0
          },
          // Note: 'Total Search Volume' is a formula in Notion, no need to set it

          // Groupe : Categorization EN (5)
          'Type EN': {
            select: { name: original.categorization?.type || 'N/A' }
          },
          'Market EN': {
            select: { name: original.categorization?.market || 'N/A' }
          },
          'Target Audience EN': richText(original.categorization?.targetAudience || ''),
          'Main Competitor EN': {
            rich_text: [{ text: { content: original.categorization?.mainCompetitor || '' } }]
          },
          'Trend Analysis EN': richText(original.categorization?.trendAnalysis || ''),

          // Groupe : Categorization FR (5)
          'Type FR': {
            select: { name: translated.categorization?.type || 'N/A' }
          },
          'Marché FR': richText(translated.categorization?.market || ''),
          'Audience Cible FR': richText(translated.categorization?.targetAudience || ''),
          'Concurrent Principal FR': {
            rich_text: [{ text: { content: translated.categorization?.mainCompetitor || '' } }]
          },
          'Analyse Tendances FR': richText(translated.categorization?.trendAnalysis || ''),

          // Groupe : Métriques (5)
          'Word Count EN': {
            number: original.metadata?.wordCountEN || 0
          },
          'Word Count FR': {
            number: 0 // Will be calculated from translated content
          },
          'Total Score': {
            number: original.metadata?.totalScore || 0
          },
          'Translation Duration': {
            number: Math.round((translationMetadata?.duration || 0) / 1000) // Convert to seconds
          },
          'Failed Translations': {
            rich_text: [{
              text: {
                content: (translationMetadata?.failedFields || []).join(', ') || ''
              }
            }]
          },

          // Groupe : Erreurs (1) - empty for success
          'Erreur': {
            rich_text: []
          }
        },

        // Page content (blocks) with full details
        children: [
          // Business Fit EN - Full content
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ text: { content: 'Business Fit - Détails complets (EN)' } }]
            }
          },
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          ...createBusinessFitBlocks(original.businessFit, 'EN'),

          // Business Fit FR - Full content
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ text: { content: 'Business Fit - Détails complets (FR)' } }]
            }
          },
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          ...createBusinessFitBlocks(translated.businessFit, 'FR'),

          // Keywords table
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ text: { content: 'Keywords - Données détaillées' } }]
            }
          },
          ...createKeywordsBlocks(original.keywords || []),

          // Categorization bilingual
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ text: { content: 'Categorization (EN/FR)' } }]
            }
          },
          ...createCategorizationBlocks(original.categorization, translated.categorization)
        ]
      });
    });

    logger.info('IdeaBrowser Notion entry created successfully', {
      pageId: response.id,
      url: original.url
    });

    return response.id;
  } catch (error: any) {
    logger.error('Failed to create IdeaBrowser Notion entry', {
      error: error.message,
      code: error.code,
      url: original.url
    });
    throw error;
  }
}

/**
 * Helper: Create Business Fit blocks
 */
function createBusinessFitBlocks(businessFit: any, lang: string): any[] {
  const sections = [
    { key: 'opportunities', title: lang === 'EN' ? 'Opportunities' : 'Opportunités' },
    { key: 'problems', title: lang === 'EN' ? 'Problems' : 'Problèmes' },
    { key: 'whyNow', title: lang === 'EN' ? 'Why Now' : 'Pourquoi Maintenant' },
    { key: 'feasibility', title: lang === 'EN' ? 'Feasibility' : 'Faisabilité' },
    { key: 'revenuePotential', title: lang === 'EN' ? 'Revenue Potential' : 'Potentiel Revenus' },
    { key: 'executionDifficulty', title: lang === 'EN' ? 'Execution Difficulty' : 'Difficulté Exécution' },
    { key: 'goToMarket', title: lang === 'EN' ? 'Go-to-Market' : 'Go-to-Market' }
  ];

  const blocks: any[] = [];

  for (const section of sections) {
    const content = businessFit?.[section.key] || 'N/A';

    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ text: { content: section.title } }]
      }
    });

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: splitIntoRichTextBlocks(content, 2000)
      }
    });
  }

  return blocks;
}

/**
 * Helper: Create Keywords blocks as table
 */
function createKeywordsBlocks(keywords: any[]): any[] {
  if (!keywords || keywords.length === 0) {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: 'No keywords found.' } }]
      }
    }];
  }

  const blocks: any[] = [];

  // Create table header and rows
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: 'Keywords | Volume | Growth | Trend' } }]
    }
  });

  for (const kw of keywords) {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          text: {
            content: `${kw.name} | ${kw.volume.toLocaleString()} | ${kw.growth}% | ${kw.trend}`
          }
        }]
      }
    });
  }

  return blocks;
}

/**
 * Helper: Create Categorization blocks (bilingual)
 */
function createCategorizationBlocks(catEN: any, catFR: any): any[] {
  const fields = [
    { key: 'type', label: 'Type' },
    { key: 'market', label: 'Market/Marché' },
    { key: 'targetAudience', label: 'Target Audience/Audience Cible' },
    { key: 'mainCompetitor', label: 'Main Competitor/Concurrent Principal' },
    { key: 'trendAnalysis', label: 'Trend Analysis/Analyse Tendances' }
  ];

  const blocks: any[] = [];

  for (const field of fields) {
    const enValue = catEN?.[field.key] || 'N/A';
    const frValue = catFR?.[field.key] || 'N/A';

    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ text: { content: field.label } }]
      }
    });

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { text: { content: '🇬🇧 EN: ' } },
          { text: { content: enValue } }
        ]
      }
    });

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { text: { content: '🇫🇷 FR: ' } },
          { text: { content: frValue } }
        ]
      }
    });
  }

  return blocks;
}

/**
 * Create error entry for IdeaBrowser workflow
 */
export async function createIdeaBrowserErrorEntry(
  url: string,
  errorMessage: string
): Promise<string> {
  const notion = getNotionClient();
  const databaseId = getDatabaseId();

  try {
    const response = await retryWithBackoff(async () => {
      return await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          'Name': {
            title: [{ text: { content: 'Error - ' + url } }]
          },
          'Date scraping': {
            date: { start: new Date().toISOString() }
          },
          'URL': {
            url: url
          },
          'Statut': {
            select: { name: 'error' }
          },
          'Erreur': {
            rich_text: [{ text: { content: truncateText(errorMessage, 2000) } }]
          },
          // Set all numeric fields to 0
          'Keywords Count': { number: 0 },
          'Avg Keyword Volume': { number: 0 },
          'High Growth Keywords': { number: 0 },
          'Word Count EN': { number: 0 },
          'Word Count FR': { number: 0 },
          'Total Score': { number: 0 },
          'Translation Duration': { number: 0 }
        }
      });
    });

    logger.info('IdeaBrowser error entry created', { pageId: response.id, url });
    return response.id;
  } catch (error: any) {
    logger.error('Failed to create IdeaBrowser error entry', {
      error: error.message,
      url
    });
    throw error;
  }
}
