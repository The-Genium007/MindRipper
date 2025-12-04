import axios from 'axios';
import logger from './logger.js';

export interface TranslatedContent {
  original: string;
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
  characterCount: number;
}

// LibreTranslate - Free and open-source translation
// You can use the public instance or host your own: https://github.com/LibreTranslate/LibreTranslate
const LIBRE_TRANSLATE_URL = process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.com/translate';
const MAX_CHUNK_SIZE = 5000; // Safe chunk size for most APIs
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;

/**
 * Split text into chunks that respect API limits
 */
function splitIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  // Split by paragraphs (double newline)
  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    // If single paragraph exceeds limit, split by sentences
    if (paragraph.length > maxSize) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxSize) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          // If single sentence still too large, force split
          if (sentence.length > maxSize) {
            let start = 0;
            while (start < sentence.length) {
              chunks.push(sentence.slice(start, start + maxSize));
              start += maxSize;
            }
          } else {
            currentChunk = sentence;
          }
        } else {
          currentChunk += sentence;
        }
      }
    } else {
      if (currentChunk.length + paragraph.length + 2 > maxSize) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Translate text using LibreTranslate API with retry logic
 * LibreTranslate is free and open-source, can be self-hosted or use public instance
 */
async function translateChunk(
  text: string,
  sourceLang: string,
  targetLang: string,
  attempt: number = 0
): Promise<{ translatedText: string; detectedSourceLanguage: string }> {
  try {
    const apiKey = process.env.LIBRE_TRANSLATE_API_KEY; // Optional for self-hosted instances

    const requestBody: any = {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    };

    // Add API key if provided (for self-hosted instances or premium public access)
    if (apiKey) {
      requestBody.api_key = apiKey;
    }

    const response = await axios.post(
      LIBRE_TRANSLATE_URL,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return {
      translatedText: response.data.translatedText,
      detectedSourceLanguage: sourceLang,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.message;

      // Handle rate limiting
      if (status === 429) {
        logger.warn('LibreTranslate rate limit reached', { message });

        // Retry with longer delay for rate limits
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt) * 2; // Double delay for rate limits
          logger.warn(`Translation retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`, {
            error: message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          return translateChunk(text, sourceLang, targetLang, attempt + 1);
        }

        throw new Error('Translation rate limit exceeded. Consider using a self-hosted LibreTranslate instance or adding an API key.');
      }

      // Handle invalid API key
      if (status === 403) {
        logger.error('LibreTranslate API authentication failed', { status, message });
        throw new Error('Invalid LibreTranslate API key.');
      }

      // Handle unsupported language
      if (status === 400 && message.includes('language')) {
        logger.error('Unsupported language pair', { status, message, sourceLang, targetLang });
        throw new Error(`Unsupported language pair: ${sourceLang} -> ${targetLang}`);
      }

      // Retry on network errors
      if (attempt < MAX_RETRIES && (status === 500 || status === 503 || !status)) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        logger.warn(`Translation retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`, {
          error: message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return translateChunk(text, sourceLang, targetLang, attempt + 1);
      }
    }

    throw error;
  }
}

/**
 * Translate text from source language to target language
 */
export async function translateText(
  text: string,
  targetLang: string = 'fr',
  sourceLang: string = 'en'
): Promise<TranslatedContent> {
  try {
    logger.info('Starting translation', {
      textLength: text.length,
      sourceLang,
      targetLang,
      chunks: Math.ceil(text.length / MAX_CHUNK_SIZE),
      usingLibreTranslate: true,
    });

    // Split text into chunks if necessary
    const chunks = splitIntoChunks(text, MAX_CHUNK_SIZE);
    logger.debug(`Text split into ${chunks.length} chunk(s)`);

    // Translate each chunk
    const translatedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      logger.debug(`Translating chunk ${i + 1}/${chunks.length}`, {
        chunkSize: chunks[i].length,
      });

      const result = await translateChunk(chunks[i], sourceLang, targetLang);
      translatedChunks.push(result.translatedText);

      // Delay between chunks to respect rate limits (especially for public instance)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay for public instance
      }
    }

    // Combine translated chunks
    const translatedText = translatedChunks.join('\n\n');

    logger.info('Translation completed successfully', {
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      originalLength: text.length,
      translatedLength: translatedText.length,
      characterCount: text.length,
    });

    return {
      original: text,
      translated: translatedText,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      characterCount: text.length,
    };
  } catch (error) {
    logger.error('Translation failed', {
      error: error instanceof Error ? error.message : String(error),
      textLength: text.length,
    });
    throw error;
  }
}

/**
 * Translate multiple texts in batch (useful for title + content)
 */
export async function translateBatch(
  texts: Record<string, string>,
  targetLang: string = 'fr',
  sourceLang: string = 'en'
): Promise<Record<string, TranslatedContent>> {
  const results: Record<string, TranslatedContent> = {};

  for (const [key, text] of Object.entries(texts)) {
    if (text && text.trim()) {
      try {
        results[key] = await translateText(text, targetLang, sourceLang);
        // Delay between translations to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.warn(`Failed to translate ${key}, keeping original`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fallback: keep original text
        results[key] = {
          original: text,
          translated: text, // Use original as fallback
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          characterCount: text.length,
        };
      }
    }
  }

  return results;
}

/**
 * Translate IdeaBrowser content with optimized batching
 * Translates all text fields from EN to FR
 */
export async function translateIdeaBrowserContent(
  content: any, // IdeaBrowserContent type
  targetLang: string = 'fr',
  sourceLang: string = 'en'
): Promise<any> { // TranslatedIdeaBrowserContent type
  const startTime = Date.now();
  const failedFields: string[] = [];
  let totalCharacters = 0;

  logger.info('Starting IdeaBrowser content translation', {
    title: content.title,
    keywordsCount: content.keywords?.length || 0,
    businessFitSections: Object.keys(content.businessFit || {}).length
  });

  // Helper function to translate with fallback
  const translateWithFallback = async (text: string, fieldName: string): Promise<string> => {
    if (!text || !text.trim()) return '';

    totalCharacters += text.length;

    try {
      const result = await translateText(text, targetLang, sourceLang);
      return result.translated;
    } catch (error) {
      logger.warn(`Translation failed for ${fieldName}, keeping original`, {
        error: error instanceof Error ? error.message : String(error)
      });
      failedFields.push(fieldName);
      return text; // Fallback to original
    }
  };

  const translated: any = {
    title: '',
    businessFit: {
      opportunities: '',
      problems: '',
      whyNow: '',
      feasibility: '',
      revenuePotential: '',
      executionDifficulty: '',
      goToMarket: ''
    },
    keywords: [],
    categorization: {
      type: '',
      market: '',
      targetAudience: '',
      mainCompetitor: '',
      trendAnalysis: ''
    }
  };

  // Batch 1: Title (short, quick)
  logger.info('Translating title...');
  translated.title = await translateWithFallback(content.title, 'title');
  await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limiting delay

  // Batch 2-8: Business Fit sections (one by one for better control)
  logger.info('Translating Business Fit sections...');
  const bfSections = [
    'opportunities',
    'problems',
    'whyNow',
    'feasibility',
    'revenuePotential',
    'executionDifficulty',
    'goToMarket'
  ];

  for (const section of bfSections) {
    const text = content.businessFit?.[section] || '';
    if (text) {
      logger.debug(`Translating Business Fit: ${section} (${text.length} chars)`);
      translated.businessFit[section] = await translateWithFallback(text, `businessFit.${section}`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limiting delay
    }
  }

  // Batch 9: Keywords (all names together - short texts)
  logger.info('Translating keywords...');
  if (content.keywords && content.keywords.length > 0) {
    for (const kw of content.keywords) {
      try {
        const translatedName = await translateWithFallback(kw.name, `keyword.${kw.name}`);
        translated.keywords.push({
          name: translatedName,
          volume: kw.volume,
          growth: kw.growth,
          trend: kw.trend
        });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Shorter delay for keywords
      } catch (error) {
        // If keyword translation fails, keep original
        translated.keywords.push(kw);
      }
    }
  }

  // Batch 10-11: Categorization (short fields together)
  logger.info('Translating categorization...');
  const catFields = ['type', 'market', 'targetAudience', 'mainCompetitor'];
  for (const field of catFields) {
    const text = content.categorization?.[field] || '';
    if (text) {
      translated.categorization[field] = await translateWithFallback(text, `categorization.${field}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Batch 12: Trend Analysis (potentially long text, separate)
  if (content.categorization?.trendAnalysis) {
    logger.info('Translating trend analysis...');
    translated.categorization.trendAnalysis = await translateWithFallback(
      content.categorization.trendAnalysis,
      'categorization.trendAnalysis'
    );
  }

  const duration = Date.now() - startTime;

  logger.info('IdeaBrowser content translation completed', {
    duration: `${(duration / 1000).toFixed(2)}s`,
    totalCharacters,
    failedFields: failedFields.length > 0 ? failedFields : 'none'
  });

  return {
    original: content,
    translated,
    translationMetadata: {
      totalCharacters,
      batchCount: bfSections.length + 2 + (content.keywords?.length || 0) + catFields.length + 1,
      duration,
      failedFields
    }
  };
}
