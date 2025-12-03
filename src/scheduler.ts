import cron from 'node-cron';
import logger from './logger.js';
import { scrapeUrl } from './scraper.js';
import { translateBatch } from './translator.js';
import { createEntryFromScrapedContent, createErrorEntry } from './notion.js';

export interface SchedulerConfig {
  targetUrl: string;
  cronExpression: string;
  timezone?: string;
}

let scheduledTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Execute the scraping workflow
 */
export async function executeScrapingWorkflow(url: string): Promise<void> {
  if (isRunning) {
    logger.warn('Scraping workflow already running, skipping this execution');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('='.repeat(80));
    logger.info('Starting scraping workflow', { url });
    logger.info('='.repeat(80));

    // Step 1: Scrape content
    logger.info('[1/3] Scraping content...');
    const scrapedContent = await scrapeUrl(url);
    logger.info('[1/3] Scraping completed', {
      title: scrapedContent.title,
      wordCount: scrapedContent.wordCount,
    });

    // Step 2: Translate title and content
    logger.info('[2/3] Translating content...');
    const translations = await translateBatch({
      title: scrapedContent.title,
      content: scrapedContent.content,
    }, 'fr');

    logger.info('[2/3] Translation completed', {
      titleChars: translations.title.characterCount,
      contentChars: translations.content.characterCount,
      totalChars: translations.title.characterCount + translations.content.characterCount,
    });

    // Step 3: Create Notion entry
    logger.info('[3/3] Creating Notion entry...');
    const pageId = await createEntryFromScrapedContent(
      scrapedContent,
      translations.title,
      translations.content
    );
    logger.info('[3/3] Notion entry created', { pageId });

    const duration = Date.now() - startTime;
    logger.info('='.repeat(80));
    logger.info('Scraping workflow completed successfully', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      url,
      pageId,
    });
    logger.info('='.repeat(80));
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Scraping workflow failed', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    // Try to create error entry in Notion
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await createErrorEntry(url, errorMessage);
      logger.info('Error entry created in Notion');
    } catch (notionError) {
      logger.error('Failed to create error entry in Notion', {
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

  // Create scheduled task
  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      logger.info('Cron job triggered');
      try {
        await executeScrapingWorkflow(targetUrl);
      } catch (error) {
        logger.error('Scheduled workflow failed', {
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
