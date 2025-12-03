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
