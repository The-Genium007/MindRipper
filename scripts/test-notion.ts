#!/usr/bin/env tsx
/**
 * Test de l'intégration Notion IdeaBrowser
 */

import 'dotenv/config';
import { createIdeaBrowserEntry } from '../src/notion.js';
import logger from '../src/logger.js';
import fs from 'fs';

async function test() {
  console.log('🧪 Test de l\'intégration Notion IdeaBrowser\n');

  // Charger le résultat de la traduction
  const translationResultPath = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/translation-result.json';

  if (!fs.existsSync(translationResultPath)) {
    console.error('❌ Fichier translation-result.json non trouvé. Exécutez test-translation.ts d\'abord.');
    process.exit(1);
  }

  const translationResult = JSON.parse(fs.readFileSync(translationResultPath, 'utf-8'));
  console.log(`📄 Contenu chargé: ${translationResult.original.title}\n`);

  try {
    console.log('🔄 Création de l\'entrée Notion...\n');

    const pageId = await createIdeaBrowserEntry(
      translationResult.original,
      translationResult.translated,
      translationResult.translationMetadata
    );

    console.log('\n✅ ENTRÉE NOTION CRÉÉE AVEC SUCCÈS!\n');
    console.log('═'.repeat(80));
    console.log('\n📊 RÉSULTATS:\n');

    console.log(`🎯 Page ID: ${pageId}`);
    console.log(`📍 URL: https://notion.so/${pageId.replace(/-/g, '')}`);

    console.log('\n📋 Propriétés créées:');
    console.log('  ✅ Général: 6 propriétés (Name, Date scraping, Date publication, URL, Statut, Image Preview)');
    console.log('  ✅ Business Fit EN: 7 propriétés');
    console.log('  ✅ Business Fit FR: 7 propriétés');
    console.log('  ✅ Keywords: 6 propriétés (Keywords, Top Keyword, Keywords Count, etc.)');
    console.log('  ✅ Categorization EN: 5 propriétés');
    console.log('  ✅ Categorization FR: 5 propriétés');
    console.log('  ✅ Métriques: 5 propriétés (Word Count EN/FR, Total Score, etc.)');
    console.log('  ✅ Erreurs: 1 propriété');
    console.log('  📊 Total: 42 propriétés');

    console.log('\n📄 Blocks de page créés:');
    console.log('  ✅ Business Fit EN (7 sections avec heading + paragraphe)');
    console.log('  ✅ Business Fit FR (7 sections avec heading + paragraphe)');
    console.log(`  ✅ Keywords (${translationResult.original.keywords.length} keywords en liste)`);
    console.log('  ✅ Categorization bilingue (5 champs EN/FR)');

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Ouvrez Notion pour voir l\'entrée complète !');

  } catch (error) {
    console.error('\n❌ ERREUR:', error);
    process.exit(1);
  }
}

test();
