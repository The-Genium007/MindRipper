#!/usr/bin/env tsx
/**
 * Test complet du workflow IdeaBrowser end-to-end
 * Teste: Scraping → Traduction → Notion
 */

import 'dotenv/config';
import { executeIdeaBrowserWorkflow } from '../src/scheduler.js';
import logger from '../src/logger.js';

async function test() {
  console.log('🧪 Test complet du workflow IdeaBrowser\n');
  console.log('Ce test va exécuter le workflow complet:');
  console.log('  1. Scraping avec Puppeteer');
  console.log('  2. Traduction complète (EN→FR)');
  console.log('  3. Création entrée Notion (42 propriétés)\n');
  console.log('⏱️  Durée estimée: 1-2 minutes\n');
  console.log('═'.repeat(80));

  const url = process.env.TARGET_URL || 'https://www.ideabrowser.com';

  // Vérifier que les credentials Notion sont configurés
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    console.error('\n❌ ERREUR: Credentials Notion manquants');
    console.error('Assurez-vous que NOTION_API_KEY et NOTION_DATABASE_ID sont définis dans .env');
    process.exit(1);
  }

  try {
    await executeIdeaBrowserWorkflow(url);

    console.log('\n═'.repeat(80));
    console.log('\n✅ WORKFLOW COMPLET RÉUSSI!\n');
    console.log('🎉 L\'entrée a été créée dans Notion avec succès');
    console.log('📊 Ouvrez votre base Notion pour voir les résultats\n');

  } catch (error) {
    console.error('\n═'.repeat(80));
    console.error('\n❌ WORKFLOW ÉCHOUÉ\n');
    console.error('Erreur:', error);
    process.exit(1);
  }
}

test();
