import cron from 'node-cron';
import logger from './logger.js';
import { scrapeIdeaBrowserUrl } from './scraper.js';
import { translateIdeaBrowserContent } from './translator.js';
import { createIdeaBrowserEntry, createIdeaBrowserErrorEntry } from './notion.js';

export interface SchedulerConfig {
  targetUrl: string;
  cronExpression: string;
  timezone?: string;
}

let scheduledTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Legacy scraping workflow (kept for backwards compatibility)
 * NOTE: Use executeIdeaBrowserWorkflow() for IdeaBrowser scraping
 */
export async function executeScrapingWorkflow(url: string): Promise<void> {
  logger.warn('executeScrapingWorkflow is deprecated. Use executeIdeaBrowserWorkflow() instead.');
  return executeIdeaBrowserWorkflow(url);
}

/**
 * Execute the IdeaBrowser workflow (Puppeteer scraper)
 */
export async function executeIdeaBrowserWorkflow(url: string): Promise<void> {
  if (isRunning) {
    logger.warn('IdeaBrowser workflow already running, skipping this execution');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('='.repeat(80));
    logger.info('Starting IdeaBrowser workflow', { url });
    logger.info('='.repeat(80));

    // Step 1: Scrape IdeaBrowser content with Puppeteer
    logger.info('[1/3] Scraping IdeaBrowser content with Puppeteer...');
    const scrapedContent = await scrapeIdeaBrowserUrl(url);
    logger.info('[1/3] Scraping completed', {
      title: scrapedContent.title,
      keywordsCount: scrapedContent.keywords?.length || 0,
      wordCount: scrapedContent.metadata.wordCountEN,
      businessFitSections: Object.keys(scrapedContent.businessFit).length
    });

    // Step 2: Translate all content (title, business fit, keywords, categorization)
    logger.info('[2/3] Translating IdeaBrowser content (this may take 1-2 minutes)...');
    const translationResult = await translateIdeaBrowserContent(scrapedContent, 'fr', 'en');
    logger.info('[2/3] Translation completed', {
      totalCharacters: translationResult.translationMetadata.totalCharacters,
      batchCount: translationResult.translationMetadata.batchCount,
      duration: `${(translationResult.translationMetadata.duration / 1000).toFixed(2)}s`,
      failedFields: translationResult.translationMetadata.failedFields.length > 0
        ? translationResult.translationMetadata.failedFields.join(', ')
        : 'none'
    });

    // Step 3: Create Notion entry with 42 properties
    logger.info('[3/3] Creating IdeaBrowser Notion entry with 42 properties...');
    const pageId = await createIdeaBrowserEntry(
      translationResult.original,
      translationResult.translated,
      translationResult.translationMetadata
    );
    logger.info('[3/3] IdeaBrowser Notion entry created', { pageId });

    const duration = Date.now() - startTime;
    logger.info('='.repeat(80));
    logger.info('IdeaBrowser workflow completed successfully', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      url,
      pageId,
      keywordsExtracted: scrapedContent.keywords?.length || 0,
      businessFitSections: Object.keys(scrapedContent.businessFit).length,
      translationDuration: `${(translationResult.translationMetadata.duration / 1000).toFixed(2)}s`
    });
    logger.info('='.repeat(80));
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('IdeaBrowser workflow failed', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    // Try to create error entry in Notion
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await createIdeaBrowserErrorEntry(url, errorMessage);
      logger.info('IdeaBrowser error entry created in Notion');
    } catch (notionError) {
      logger.error('Failed to create IdeaBrowser error entry in Notion', {
        error: notionError instanceof Error ? notionError.message : String(notionError),
      });
    }

    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Validate cron expression
 */
function validateCronExpression(expression: string): boolean {
  return cron.validate(expression);
}

/**
 * Start the scheduler
 */
export function startScheduler(config: SchedulerConfig): void {
  const { targetUrl, cronExpression, timezone = 'Europe/Paris' } = config;

  if (!targetUrl) {
    throw new Error('TARGET_URL is required');
  }

  if (!cronExpression) {
    throw new Error('SCRAPE_CRON expression is required');
  }

  if (!validateCronExpression(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  // Stop existing task if any
  if (scheduledTask) {
    scheduledTask.stop();
  }

  logger.info('Starting scheduler', {
    targetUrl,
    cronExpression,
    timezone,
  });

  // Create scheduled task - Use IdeaBrowser workflow
  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      logger.info('Cron job triggered');
      try {
        await executeIdeaBrowserWorkflow(targetUrl);
      } catch (error) {
        logger.error('Scheduled IdeaBrowser workflow failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      scheduled: true,
      timezone,
    }
  );

  logger.info('Scheduler started successfully', {
    cronExpression,
    timezone,
    nextRun: getNextScheduledRun(cronExpression),
  });
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Get next scheduled run time (approximation)
 */
function getNextScheduledRun(cronExpression: string): string {
  // Simple parser for common cron patterns
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) {
    return 'Unknown';
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily pattern (e.g., "0 9 * * *")
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Weekly pattern (e.g., "0 9 * * 1")
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
    return `Weekly on ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return cronExpression;
}

/**
 * Check if workflow is currently running
 */
export function isWorkflowRunning(): boolean {
  return isRunning;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isScheduled: boolean;
  isRunning: boolean;
} {
  return {
    isScheduled: scheduledTask !== null,
    isRunning,
  };
}
