#!/usr/bin/env tsx
/**
 * Test de la traduction IdeaBrowser
 */

import 'dotenv/config';
import { translateIdeaBrowserContent } from '../src/translator.js';
import logger from '../src/logger.js';
import fs from 'fs';

async function test() {
  console.log('🧪 Test de la traduction IdeaBrowser\n');

  // Charger le résultat du scraper
  const scraperResultPath = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/scraper-result.json';

  if (!fs.existsSync(scraperResultPath)) {
    console.error('❌ Fichier scraper-result.json non trouvé. Exécutez test-scraper.ts d\'abord.');
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(scraperResultPath, 'utf-8'));
  console.log(`📄 Contenu chargé: ${content.title}\n`);

  try {
    console.log('🔄 Traduction en cours (cela peut prendre 1-2 minutes)...\n');

    const result = await translateIdeaBrowserContent(content);

    console.log('\n✅ TRADUCTION RÉUSSIE!\n');
    console.log('═'.repeat(80));
    console.log('\n📊 RÉSULTATS:\n');

    console.log('🎯 Titre:');
    console.log(`  EN: ${content.title}`);
    console.log(`  FR: ${result.translated.title}`);

    console.log('\n💼 Business Fit (aperçu):');
    console.log(`  Opportunities EN: ${content.businessFit.opportunities.substring(0, 100)}...`);
    console.log(`  Opportunities FR: ${result.translated.businessFit.opportunities.substring(0, 100)}...`);

    console.log('\n🔑 Keywords (3 premiers):');
    for (let i = 0; i < Math.min(3, content.keywords.length); i++) {
      console.log(`  ${i + 1}. EN: ${content.keywords[i].name} → FR: ${result.translated.keywords[i].name}`);
    }

    console.log('\n📊 Categorization:');
    console.log(`  Type EN: ${content.categorization.type} → FR: ${result.translated.categorization.type}`);
    console.log(`  Market EN: ${content.categorization.market} → FR: ${result.translated.categorization.market}`);

    console.log('\n📈 Métriques de traduction:');
    console.log(`  Total Characters: ${result.translationMetadata.totalCharacters}`);
    console.log(`  Batch Count: ${result.translationMetadata.batchCount}`);
    console.log(`  Duration: ${(result.translationMetadata.duration / 1000).toFixed(2)}s`);
    console.log(`  Failed Fields: ${result.translationMetadata.failedFields.length > 0 ? result.translationMetadata.failedFields.join(', ') : 'none'}`);

    console.log('\n' + '═'.repeat(80));

    // Sauvegarder le résultat
    const outputPath = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/translation-result.json';
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Résultat sauvegardé: ${outputPath}`);

  } catch (error) {
    console.error('\n❌ ERREUR:', error);
    process.exit(1);
  }
}

test();
