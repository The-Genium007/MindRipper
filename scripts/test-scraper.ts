#!/usr/bin/env tsx
/**
 * Test du nouveau scraper IdeaBrowser
 */

import 'dotenv/config';
import { scrapeIdeaBrowserUrl } from '../src/scraper.js';
import logger from '../src/logger.js';

async function test() {
  console.log('🧪 Test du scraper IdeaBrowser\n');

  const url = process.env.TARGET_URL || 'https://www.ideabrowser.com';
  console.log(`URL: ${url}\n`);

  try {
    const content = await scrapeIdeaBrowserUrl(url);

    console.log('\n✅ SCRAPING RÉUSSI!\n');
    console.log('═'.repeat(80));
    console.log('\n📊 RÉSULTATS:\n');

    console.log('🎯 Métadonnées:');
    console.log(`  Titre: ${content.title}`);
    console.log(`  Date pub: ${content.publishedDate?.toISOString() || 'N/A'}`);
    console.log(`  URL: ${content.url}`);
    console.log(`  OG Image: ${content.openGraph.image || 'N/A'}`);

    console.log('\n💼 Business Fit:');
    Object.entries(content.businessFit).forEach(([key, value]) => {
      const preview = value ? value.substring(0, 100) + (value.length > 100 ? '...' : '') : 'N/A';
      console.log(`  ${key}: ${preview}`);
    });

    console.log('\n🔑 Keywords:');
    content.keywords.forEach((kw, idx) => {
      console.log(`  ${idx + 1}. ${kw.name}`);
      console.log(`     Volume: ${kw.volume.toLocaleString()} | Growth: ${kw.growth}% | Trend: ${kw.trend}`);
    });

    console.log('\n📊 Categorization:');
    Object.entries(content.categorization).forEach(([key, value]) => {
      console.log(`  ${key}: ${value || 'N/A'}`);
    });

    console.log('\n📈 Métriques:');
    console.log(`  Word Count: ${content.metadata.wordCountEN}`);
    console.log(`  Keywords Count: ${content.metadata.keywordsCount}`);
    console.log(`  Avg Keyword Volume: ${content.metadata.avgKeywordVolume.toLocaleString()}`);
    console.log(`  High Growth Keywords: ${content.metadata.highGrowthKeywordsCount}`);

    console.log('\n' + '═'.repeat(80));

    // Sauvegarder le résultat
    const fs = await import('fs');
    const path = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/scraper-result.json';
    fs.writeFileSync(path, JSON.stringify(content, null, 2));
    console.log(`\n💾 Résultat sauvegardé: ${path}`);

  } catch (error) {
    console.error('\n❌ ERREUR:', error);
    process.exit(1);
  }
}

test();
