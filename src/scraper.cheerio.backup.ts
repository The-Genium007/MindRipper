import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from './logger.js';

export interface ScrapedContent {
  url: string;
  title: string;
  author?: string;
  publishedDate?: Date;
  content: string;
  wordCount: number;
  scrapedAt: Date;
}

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

/**
 * Exponential backoff delay
 */
function getBackoffDelay(attempt: number, initialDelay: number, maxDelay: number): number {
  const delay = initialDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 1000;
  const maxDelay = options.maxDelay || 10000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = getBackoffDelay(attempt, initialDelay, maxDelay);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: lastError.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Fetch HTML content from URL
 */
async function fetchHTML(url: string): Promise<string> {
  logger.info('Fetching URL', { url });

  const response = await retryWithBackoff(
    async () => {
      return await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 30000, // 30s timeout
      });
    },
    { maxRetries: 3, initialDelay: 1000, maxDelay: 10000 }
  );

  if (response.status !== 200) {
    throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
  }

  return response.data;
}

/**
 * Extract title from HTML
 */
function extractTitle($: cheerio.CheerioAPI): string {
  // Try multiple selectors in order of preference
  const selectors = [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'h1',
    'title',
    'meta[name="title"]',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    let title = '';

    if (selector.startsWith('meta')) {
      title = element.attr('content')?.trim() || '';
    } else {
      title = element.text().trim();
    }

    if (title) {
      logger.debug('Title extracted', { selector, title });
      return title;
    }
  }

  throw new Error('Could not extract title from page');
}

/**
 * Extract author from HTML
 */
function extractAuthor($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="twitter:creator"]',
    '.author',
    '[rel="author"]',
    '[itemprop="author"]',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    let author = '';

    if (selector.startsWith('meta')) {
      author = element.attr('content')?.trim() || '';
    } else {
      author = element.text().trim();
    }

    if (author) {
      logger.debug('Author extracted', { selector, author });
      return author;
    }
  }

  return undefined;
}

/**
 * Extract published date from HTML
 */
function extractPublishedDate($: cheerio.CheerioAPI): Date | undefined {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="publish_date"]',
    'meta[name="date"]',
    'time[datetime]',
    '[itemprop="datePublished"]',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    let dateStr = '';

    if (selector.startsWith('meta')) {
      dateStr = element.attr('content')?.trim() || '';
    } else if (selector.includes('[datetime]')) {
      dateStr = element.attr('datetime')?.trim() || '';
    } else {
      dateStr = element.attr('content')?.trim() || element.text().trim();
    }

    if (dateStr) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        logger.debug('Published date extracted', { selector, date: date.toISOString() });
        return date;
      }
    }
  }

  return undefined;
}

/**
 * Extract main content from HTML
 */
function extractContent($: cheerio.CheerioAPI): string {
  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, iframe, noscript').remove();
  $('.advertisement, .ad, .ads, .social-share, .comments').remove();

  // Try to find main content area
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    'body',
  ];

  for (const selector of contentSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const content = element
        .text()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      if (content.length > 100) { // Minimum content length
        logger.debug('Content extracted', { selector, length: content.length });
        return content;
      }
    }
  }

  throw new Error('Could not extract meaningful content from page');
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Scrape content from URL
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  try {
    logger.info('Starting scrape', { url });

    // Fetch HTML
    const html = await fetchHTML(url);

    // Parse with Cheerio
    const $ = cheerio.load(html);

    // Extract all metadata
    const title = extractTitle($);
    const author = extractAuthor($);
    const publishedDate = extractPublishedDate($);
    const content = extractContent($);
    const wordCount = countWords(content);

    const result: ScrapedContent = {
      url,
      title,
      author,
      publishedDate,
      content,
      wordCount,
      scrapedAt: new Date(),
    };

    logger.info('Scrape completed successfully', {
      url,
      title,
      wordCount,
      hasAuthor: !!author,
      hasPublishedDate: !!publishedDate,
    });

    return result;
  } catch (error) {
    logger.error('Scrape failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
