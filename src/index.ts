import 'dotenv/config';
import express, { Request, Response } from 'express';
import logger from './logger.js';
import { startScheduler, stopScheduler, executeScrapingWorkflow, getSchedulerStatus, isWorkflowRunning } from './scheduler.js';
import { testNotionConnection } from './notion.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', async (_req: Request, res: Response) => {
  const status = getSchedulerStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: {
      isScheduled: status.isScheduled,
      isRunning: status.isRunning,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      hasTargetUrl: !!process.env.TARGET_URL,
      hasCronExpression: !!process.env.SCRAPE_CRON,
      translationService: 'LibreTranslate',
      hasLibreTranslateKey: !!process.env.LIBRE_TRANSLATE_API_KEY,
      usingCustomLibreTranslateUrl: !!process.env.LIBRE_TRANSLATE_URL,
      hasNotionKey: !!process.env.NOTION_API_KEY,
      hasNotionDatabaseId: !!process.env.NOTION_DATABASE_ID,
    },
  });
});

/**
 * Trigger manual scraping
 */
app.post('/trigger', async (_req: Request, res: Response) => {
  const targetUrl = process.env.TARGET_URL;

  if (!targetUrl) {
    res.status(400).json({
      error: 'TARGET_URL not configured',
    });
    return;
  }

  if (isWorkflowRunning()) {
    res.status(409).json({
      error: 'Workflow already running',
      message: 'Please wait for the current workflow to complete',
    });
    return;
  }

  // Start workflow asynchronously
  res.json({
    message: 'Scraping workflow started',
    url: targetUrl,
    timestamp: new Date().toISOString(),
  });

  // Execute workflow in background
  executeScrapingWorkflow(targetUrl).catch((error) => {
    logger.error('Manual workflow execution failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

/**
 * Get scheduler status
 */
app.get('/status', (_req: Request, res: Response) => {
  const status = getSchedulerStatus();

  res.json({
    scheduler: {
      isScheduled: status.isScheduled,
      isRunning: status.isRunning,
      cronExpression: process.env.SCRAPE_CRON,
    },
    config: {
      targetUrl: process.env.TARGET_URL,
      translationService: 'LibreTranslate (Free & Open Source)',
      hasLibreTranslateKey: !!process.env.LIBRE_TRANSLATE_API_KEY,
      usingCustomLibreTranslateUrl: !!process.env.LIBRE_TRANSLATE_URL,
      hasNotionKey: !!process.env.NOTION_API_KEY,
      hasNotionDatabaseId: !!process.env.NOTION_DATABASE_ID,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, _next: any) => {
  logger.error('Express error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const required = [
    'TARGET_URL',
    'SCRAPE_CRON',
    'NOTION_API_KEY',
    'NOTION_DATABASE_ID',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Log optional variables
  if (process.env.LIBRE_TRANSLATE_API_KEY) {
    logger.info('LibreTranslate API key configured (for premium access or self-hosted instance)');
  } else {
    logger.info('Using public LibreTranslate instance (free, with rate limits)');
  }

  if (process.env.LIBRE_TRANSLATE_URL) {
    logger.info('Custom LibreTranslate URL configured:', process.env.LIBRE_TRANSLATE_URL);
  }

  logger.info('Environment variables validated successfully');
}

/**
 * Initialize application
 */
async function initialize(): Promise<void> {
  try {
    logger.info('Starting MindRipper...');
    logger.info('Node environment:', process.env.NODE_ENV || 'development');

    // Validate environment
    validateEnvironment();

    // Test Notion connection
    logger.info('Testing Notion connection...');
    const notionOk = await testNotionConnection();
    if (!notionOk) {
      throw new Error('Notion connection failed');
    }

    // Start scheduler
    const targetUrl = process.env.TARGET_URL!;
    const cronExpression = process.env.SCRAPE_CRON!;

    startScheduler({
      targetUrl,
      cronExpression,
      timezone: process.env.TZ || 'Europe/Paris',
    });

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`HTTP server listening on port ${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health   - Health check');
      logger.info('  POST /trigger  - Manually trigger scraping');
      logger.info('  GET  /status   - Get scheduler status');
      logger.info('');
      logger.info('MindRipper is ready!');
    });
  } catch (error) {
    logger.error('Initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop scheduler
    stopScheduler();

    // Close HTTP server
    logger.info('HTTP server closed');

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

// Start application
initialize();
