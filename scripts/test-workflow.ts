#!/usr/bin/env tsx
/**
 * Manual test script for the scraping workflow
 * Usage: npm run test:workflow
 */

import 'dotenv/config';
import logger from '../src/logger.js';
import { executeScrapingWorkflow } from '../src/scheduler.js';

async function main() {
  logger.info('===========================================');
  logger.info('  MindRipper - Manual Workflow Test');
  logger.info('===========================================');
  logger.info('');

  // Validate environment
  const targetUrl = process.env.TARGET_URL;

  if (!targetUrl) {
    logger.error('❌ TARGET_URL not configured in .env file');
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    logger.error('❌ NOTION_API_KEY not configured in .env file');
    process.exit(1);
  }

  if (!process.env.NOTION_DATABASE_ID) {
    logger.error('❌ NOTION_DATABASE_ID not configured in .env file');
    process.exit(1);
  }

  logger.info('✓ Environment variables validated');
  logger.info('');
  logger.info(`Target URL: ${targetUrl}`);
  logger.info(`Translation service: ${process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.com/translate'}`);
  logger.info('');
  logger.info('Starting workflow...');
  logger.info('');

  try {
    const startTime = Date.now();
    await executeScrapingWorkflow(targetUrl);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('');
    logger.info('===========================================');
    logger.info(`✅ Workflow completed in ${duration}s`);
    logger.info('===========================================');
    process.exit(0);
  } catch (error) {
    logger.error('');
    logger.error('===========================================');
    logger.error('❌ Workflow failed');
    logger.error('===========================================');
    logger.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
