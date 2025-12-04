/**
 * Types for IdeaBrowser.com scraping
 */

export interface IdeaBrowserContent {
  // Métadonnées de base
  url: string;
  title: string;
  publishedDate?: Date;
  scrapedAt: Date;

  // Business Fit sections
  businessFit: {
    opportunities: string;
    problems: string;
    whyNow: string;
    feasibility: string;
    revenuePotential: string;
    executionDifficulty: string;
    goToMarket: string;
  };

  // Keywords avec données de graphiques
  keywords: Array<{
    name: string;
    volume: number;
    growth: number;
    trend: 'growing' | 'stable' | 'declining';
  }>;

  // Categorization
  categorization: {
    type: string;
    market: string;
    targetAudience: string;
    mainCompetitor: string;
    trendAnalysis: string;
  };

  // Métadonnées calculées
  metadata: {
    totalScore?: number;
    wordCountEN: number;
    keywordsCount: number;
    avgKeywordVolume: number;
    highGrowthKeywordsCount: number;
  };

  // Métadonnées Open Graph
  openGraph: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
  };
}

/**
 * Keyword avec volume et croissance
 */
export interface Keyword {
  name: string;
  volume: number;
  growth: number;
  trend: 'growing' | 'stable' | 'declining';
}

/**
 * Business Fit data
 */
export interface BusinessFit {
  opportunities: string;
  problems: string;
  whyNow: string;
  feasibility: string;
  revenuePotential: string;
  executionDifficulty: string;
  goToMarket: string;
}

/**
 * Categorization data
 */
export interface Categorization {
  type: string;
  market: string;
  targetAudience: string;
  mainCompetitor: string;
  trendAnalysis: string;
}

/**
 * Open Graph metadata
 */
export interface OpenGraphMetadata {
  title?: string;
  description?: string;
  image?: string;
  type?: string;
}
