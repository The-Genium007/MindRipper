/**
 * IdeaBrowser.com scraper using Puppeteer
 * Extracts structured data from "Idea of the Day" pages
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import logger from './logger.js';
import { IdeaBrowserContent, Keyword, BusinessFit, Categorization, OpenGraphMetadata } from './types/scraper.types.js';

// Configuration
const PUPPETEER_TIMEOUT = parseInt(process.env.PUPPETEER_TIMEOUT || '60000');
const PUPPETEER_HEADLESS = process.env.PUPPETEER_HEADLESS !== 'false';
const PUPPETEER_WAIT_UNTIL = (process.env.PUPPETEER_WAIT_UNTIL || 'networkidle2') as any;

/**
 * Launch browser with Docker-friendly configuration
 */
async function launchBrowser(): Promise<Browser> {
  const browser = await puppeteer.launch({
    headless: PUPPETEER_HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  return browser;
}

/**
 * Extract metadata (title, date, Open Graph)
 */
async function extractMetadata(page: Page): Promise<{
  title: string;
  publishedDate?: Date;
  openGraph: OpenGraphMetadata;
}> {
  logger.info('Extracting metadata...');

  const metadata = await page.evaluate(() => {
    // Title - chercher dans plusieurs endroits
    const title =
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.title;

    // Date - chercher dans la navigation "Previous | Date | Next"
    let dateText = '';
    const bodyText = document.body.innerText;
    const dateMatch = bodyText.match(/Previous\s*\|\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*\|/);
    if (dateMatch) {
      dateText = dateMatch[1];
    }

    // Open Graph metadata
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content');

    return {
      title: title || 'Untitled',
      dateText,
      openGraph: {
        title: ogTitle || undefined,
        description: ogDescription || undefined,
        image: ogImage || undefined,
        type: ogType || undefined
      }
    };
  });

  // Parse date
  let publishedDate: Date | undefined;
  if (metadata.dateText) {
    try {
      publishedDate = new Date(metadata.dateText);
      if (isNaN(publishedDate.getTime())) {
        logger.warn('Invalid date parsed', { dateText: metadata.dateText });
        publishedDate = undefined;
      }
    } catch (error) {
      logger.warn('Failed to parse date', { dateText: metadata.dateText });
    }
  }

  logger.info('Metadata extracted', {
    title: metadata.title,
    publishedDate: publishedDate?.toISOString(),
    hasOgImage: !!metadata.openGraph.image
  });

  return {
    title: metadata.title,
    publishedDate,
    openGraph: metadata.openGraph
  };
}

/**
 * Extract Business Fit sections using semantic text search
 */
async function extractBusinessFit(page: Page): Promise<BusinessFit> {
  logger.info('Extracting Business Fit sections...');

  // Récupérer tout le texte de la page
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split('\n');

  // Helper function (exécuté côté Node.js, pas dans le browser)
  const findText = (searchTerms: string[]): string => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const hasMatch = searchTerms.some(term => line.includes(term.toLowerCase()));

      if (hasMatch) {
        // Collecter les lignes suivantes
        let collected = '';
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.length > 10) {
            collected += nextLine + '\n\n';
            if (collected.length > 600) break;
          }
        }
        if (collected.trim()) return collected.trim();
      }
    }
    return '';
  };

  // Extraire chaque section
  const businessFit: BusinessFit = {
    opportunities: findText(['opportunit']),
    problems: findText(['problem']),
    whyNow: findText(['why now', 'timing']),
    feasibility: findText(['feasibility', 'feasible']),
    revenuePotential: findText(['revenue potential', 'revenue']),
    executionDifficulty: findText(['execution difficulty', 'difficulty']),
    goToMarket: findText(['go-to-market', 'go to market', 'gtm'])
  };

  const filledSections = Object.values(businessFit).filter(v => v).length;
  logger.info('Business Fit extracted', { filledSections: `${filledSections}/7` });

  return businessFit;
}

/**
 * Extract keywords with volume and growth data
 */
async function extractKeywords(page: Page): Promise<Keyword[]> {
  logger.info('Extracting keywords...');

  // Récupérer le texte brut de la page
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split('\n');

  const kws: Array<{name: string; volume: string; growth: string | null; trend: string}> = [];
  let currentKw: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Détecter ligne avec volume (ex: "673.0K Volume" ou "673K")
    const volumeMatch = line.match(/(\d+\.?\d*[KMB]?)\s*(Volume|searches?|monthly)?/i);

    // Détecter ligne avec growth (ex: "+6698% Growth" ou "+123%")
    const growthMatch = line.match(/([+-]?\d+\.?\d*)%\s*(Growth|increase)?/i);

    if (volumeMatch && !line.toLowerCase().includes('total')) {
      // Nouvelle keyword potentielle
      const prevLine = lines[i - 1]?.trim() || '';
      if (prevLine && prevLine.length > 2 && prevLine.length < 100) {
        currentKw = {
          name: prevLine,
          volume: volumeMatch[1],
          growth: null,
          trend: 'stable'
        };
      }
    }

    if (growthMatch && currentKw) {
      currentKw.growth = growthMatch[1];
      const growthNum = parseFloat(growthMatch[1]);
      currentKw.trend = growthNum > 10 ? 'growing' : growthNum < -10 ? 'declining' : 'stable';
      kws.push(currentKw);
      currentKw = null;
    }
  }

  // Stratégie 2: Chercher dans les SVG si aucun keyword trouvé
  if (kws.length === 0) {
    const svgTexts = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('svg text'));
      return texts.map(t => t.textContent?.trim() || '');
    });

    let tempKw = '';
    for (const content of svgTexts) {
      if (content && !content.match(/^\d/)) {
        tempKw = content;
      } else if (content && tempKw) {
        kws.push({
          name: tempKw,
          volume: content,
          growth: '0',
          trend: 'stable'
        });
        tempKw = '';
      }
    }
  }

  const keywords = kws;

  // Parser et normaliser les volumes
  const parsedKeywords: Keyword[] = keywords.map((kw: any) => {
    // Parser volume (K=1000, M=1000000, B=1000000000)
    let volume = 0;
    if (kw.volume) {
      const volumeStr = kw.volume.toString().toUpperCase();
      const numMatch = volumeStr.match(/([\d.]+)([KMB])?/);
      if (numMatch) {
        const num = parseFloat(numMatch[1]);
        const multiplier = numMatch[2] === 'K' ? 1000 : numMatch[2] === 'M' ? 1000000 : numMatch[2] === 'B' ? 1000000000 : 1;
        volume = Math.round(num * multiplier);
      }
    }

    // Parser growth
    const growth = parseFloat(kw.growth?.toString() || '0');

    return {
      name: kw.name,
      volume,
      growth,
      trend: kw.trend as 'growing' | 'stable' | 'declining'
    };
  }).filter(kw => kw.volume > 0 && kw.name.length > 2);

  logger.info('Keywords extracted', { count: parsedKeywords.length });

  return parsedKeywords;
}

/**
 * Extract categorization data
 */
async function extractCategorization(page: Page): Promise<Categorization> {
  logger.info('Extracting categorization...');

  // Récupérer tout le texte de la page
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split('\n');

  // Helper function pour trouver une valeur après un label
  const findValue = (searchLabels: string[]): string => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const hasLabel = searchLabels.some(label => line.includes(label.toLowerCase()));

      if (hasLabel) {
        // Option 1: La valeur est sur la même ligne après ":"
        const colonMatch = line.match(/:\s*(.+)/);
        if (colonMatch) {
          return colonMatch[1].trim();
        }

        // Option 2: La valeur est sur les lignes suivantes
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && nextLine.length > 2 && nextLine.length < 200) {
            return nextLine;
          }
        }
      }
    }
    return '';
  };

  // Extraire chaque champ
  const categorization: Categorization = {
    type: findValue(['type', 'category']),
    market: findValue(['market', 'segment']),
    targetAudience: findValue(['target', 'audience', 'customer']),
    mainCompetitor: findValue(['competitor', 'competition']),
    trendAnalysis: findValue(['trend analysis', 'trends', 'market trend'])
  };

  logger.info('Categorization extracted', {
    hasType: !!categorization.type,
    hasMarket: !!categorization.market
  });

  return categorization;
}

/**
 * Calculate metadata from extracted content
 */
function calculateMetadata(content: Partial<IdeaBrowserContent>): IdeaBrowserContent['metadata'] {
  const businessFitText = Object.values(content.businessFit || {}).join(' ');
  const categorizationText = Object.values(content.categorization || {}).join(' ');
  const allText = businessFitText + ' ' + categorizationText;

  const wordCount = allText.split(/\s+/).filter(w => w.length > 0).length;
  const keywordsCount = content.keywords?.length || 0;

  let avgKeywordVolume = 0;
  let highGrowthKeywordsCount = 0;

  if (content.keywords && content.keywords.length > 0) {
    const totalVolume = content.keywords.reduce((sum, kw) => sum + kw.volume, 0);
    avgKeywordVolume = Math.round(totalVolume / content.keywords.length);
    highGrowthKeywordsCount = content.keywords.filter(kw => kw.growth > 50).length;
  }

  return {
    wordCountEN: wordCount,
    keywordsCount,
    avgKeywordVolume,
    highGrowthKeywordsCount
  };
}

/**
 * Main scraping function for IdeaBrowser.com
 */
export async function scrapeIdeaBrowserUrl(url: string): Promise<IdeaBrowserContent> {
  const startTime = Date.now();
  logger.info('Starting IdeaBrowser scrape', { url });

  let browser: Browser | null = null;

  try {
    // Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: parseInt(process.env.PUPPETEER_VIEWPORT_WIDTH || '1920'),
      height: parseInt(process.env.PUPPETEER_VIEWPORT_HEIGHT || '1080')
    });

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to URL
    logger.info('Navigating to URL', { url });
    await page.goto(url, {
      waitUntil: PUPPETEER_WAIT_UNTIL,
      timeout: PUPPETEER_TIMEOUT
    });

    logger.info('Page loaded, waiting for content...');

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract all data
    const metadata = await extractMetadata(page);
    const businessFit = await extractBusinessFit(page);
    const keywords = await extractKeywords(page);
    const categorization = await extractCategorization(page);

    // Build result
    const content: IdeaBrowserContent = {
      url,
      title: metadata.title,
      publishedDate: metadata.publishedDate,
      scrapedAt: new Date(),
      businessFit,
      keywords,
      categorization,
      metadata: {} as any, // Will be calculated below
      openGraph: metadata.openGraph
    };

    // Calculate metadata
    content.metadata = calculateMetadata(content);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('Scrape completed successfully', {
      url,
      duration: `${duration}s`,
      title: content.title,
      keywordsCount: content.keywords.length,
      wordCount: content.metadata.wordCountEN
    });

    return content;

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error('Scrape failed', {
      url,
      duration: `${duration}s`,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Test connection to a URL (for validation)
 */
export async function testConnection(url: string): Promise<boolean> {
  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await browser.close();
    return true;
  } catch (error) {
    logger.error('Connection test failed', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
