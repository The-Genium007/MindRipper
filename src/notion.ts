import { Client } from '@notionhq/client';
import logger from './logger.js';
import type { ScrapedContent } from './scraper.js';
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
 * Create entry from scraped and translated content
 */
export async function createEntryFromScrapedContent(
  scraped: ScrapedContent,
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
