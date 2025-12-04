/**
 * Types for translation system
 */

import { IdeaBrowserContent, BusinessFit, Categorization } from './scraper.types.js';

/**
 * Translated IdeaBrowser content
 */
export interface TranslatedIdeaBrowserContent {
  // Original content (EN)
  original: IdeaBrowserContent;

  // Translated content (FR)
  translated: {
    title: string;
    businessFit: BusinessFit;
    keywords: Array<{ name: string }>;
    categorization: Categorization;
  };

  // Translation metadata
  translationMetadata: {
    totalCharacters: number;
    batchCount: number;
    duration: number; // en secondes
    failedFields: string[]; // liste des champs où la traduction a échoué
  };
}

/**
 * Batch de textes à traduire ensemble
 */
export interface TranslationBatch {
  texts: string[];
  fieldNames: string[];
}

/**
 * Résultat d'une traduction
 */
export interface TranslationResult {
  success: boolean;
  translatedText: string;
  originalText: string;
  fieldName: string;
  error?: string;
}
