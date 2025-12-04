/**
 * Types for Notion integration
 */

import { IdeaBrowserContent } from './scraper.types.js';
import { TranslatedIdeaBrowserContent } from './translation.types.js';

/**
 * Entry to create in Notion database (IdeaBrowser format)
 */
export interface NotionIdeaBrowserEntry {
  // Métadonnées générales
  url: string;
  scrapedDate: Date;
  publishedDate?: Date;
  status: 'success' | 'error';
  imagePreview?: string;

  // Business Fit EN
  opportunitiesEN: string;
  problemsEN: string;
  whyNowEN: string;
  feasibilityEN: string;
  revenuePotentialEN: string;
  executionDifficultyEN: string;
  goToMarketEN: string;

  // Business Fit FR
  opportunitiesFR: string;
  problemsFR: string;
  whyNowFR: string;
  feasibilityFR: string;
  revenuePotentialFR: string;
  executionDifficultyFR: string;
  goToMarketFR: string;

  // Keywords
  keywords: string[]; // Names for multi_select
  topKeyword: string;
  keywordsCount: number;
  avgKeywordVolume: number;
  highGrowthKeywordsCount: number;

  // Categorization EN
  typeEN: string;
  marketEN: string;
  targetAudienceEN: string;
  mainCompetitorEN: string;
  trendAnalysisEN: string;

  // Categorization FR
  typeFR: string;
  marketFR: string;
  targetAudienceFR: string;
  mainCompetitorFR: string;
  trendAnalysisFR: string;

  // Métriques
  wordCountEN: number;
  wordCountFR: number;
  totalScore?: number;
  translationDuration: number;
  failedTranslations?: string;

  // Erreur (optionnel)
  errorMessage?: string;
}

/**
 * Full content for page blocks (non-truncated)
 */
export interface NotionPageContent {
  // Original content
  original: IdeaBrowserContent;

  // Translated content
  translated: TranslatedIdeaBrowserContent['translated'];
}
