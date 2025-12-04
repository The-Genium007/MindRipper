/**
 * Script de diagnostic pour l'API Notion
 * Vérifie la validité du token et l'accès à la base de données
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';

async function diagnoseNotion() {
  console.log('🔍 Diagnostic de l\'intégration Notion\n');

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  console.log('📋 Configuration:');
  console.log(`  API Key: ${apiKey?.substring(0, 10)}...${apiKey?.substring(apiKey.length - 5)}`);
  console.log(`  Database ID: ${databaseId}\n`);

  if (!apiKey) {
    console.error('❌ NOTION_API_KEY manquant dans .env');
    process.exit(1);
  }

  if (!databaseId) {
    console.error('❌ NOTION_DATABASE_ID manquant dans .env');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  // Test 1: Vérifier que le token est valide en récupérant l'utilisateur
  console.log('🧪 Test 1: Vérification du token API...');
  try {
    const user = await notion.users.me({});
    console.log(`✅ Token valide - Utilisateur: ${user.name || user.id}`);
    console.log(`   Type: ${user.type}`);
    console.log(`   Email: ${(user as any).person?.email || 'N/A'}\n`);
  } catch (error: any) {
    console.error('❌ Token invalide:', error.message);
    console.error('   Code:', error.code);
    console.error('\n💡 Solution: Vérifiez que NOTION_API_KEY est correcte dans .env\n');
    process.exit(1);
  }

  // Test 2: Vérifier l'accès à la base de données
  console.log('🧪 Test 2: Accès à la base de données...');
  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    console.log(`✅ Base de données accessible`);
    console.log(`   Titre: ${(database as any).title?.[0]?.plain_text || 'Sans titre'}`);
    console.log(`   Propriétés: ${Object.keys((database as any).properties || {}).length}\n`);
  } catch (error: any) {
    console.error('❌ Impossible d\'accéder à la base de données:', error.message);
    console.error('   Code:', error.code);

    if (error.code === 'object_not_found') {
      console.error('\n💡 Solutions possibles:');
      console.error('   1. Vérifiez que NOTION_DATABASE_ID est correct dans .env');
      console.error('   2. Vérifiez que la base de données existe toujours');
    } else if (error.code === 'unauthorized') {
      console.error('\n💡 Solution:');
      console.error('   1. Ouvrez la base de données dans Notion');
      console.error('   2. Cliquez sur "..." → "Connexions"');
      console.error('   3. Activez l\'intégration pour cette base de données');
    }
    console.error('');
    process.exit(1);
  }

  // Test 3: Lister les propriétés de la base de données
  console.log('🧪 Test 3: Liste des propriétés de la base de données...');
  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    const properties = (database as any).properties || {};
    const propertyNames = Object.keys(properties);

    console.log(`✅ ${propertyNames.length} propriétés trouvées:\n`);

    // Propriétés attendues pour IdeaBrowser
    const expectedProps = [
      'Name', 'Date scraping', 'Date publication', 'URL', 'Statut',
      'Opportunities EN', 'Problems EN', 'Keywords', 'Type EN'
    ];

    const missing = expectedProps.filter(prop => !propertyNames.includes(prop));
    const extra = propertyNames.slice(0, 10);

    console.log('   Échantillon de propriétés présentes:');
    extra.forEach(prop => {
      const type = properties[prop]?.type || 'unknown';
      console.log(`   - ${prop} (${type})`);
    });

    if (missing.length > 0) {
      console.log('\n⚠️  Propriétés manquantes pour IdeaBrowser:');
      missing.forEach(prop => console.log(`   - ${prop}`));
      console.log('\n💡 Cette base de données n\'a peut-être pas toutes les 42 propriétés requises.');
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ Erreur lors de la lecture des propriétés:', error.message);
  }

  // Test 4: Essayer de créer une entrée test minimale
  console.log('🧪 Test 4: Tentative de création d\'une entrée test...');
  try {
    const testPage = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: 'TEST - Diagnostic MindRipper',
              },
            },
          ],
        },
      },
    });

    console.log('✅ Entrée test créée avec succès!');
    console.log(`   Page ID: ${testPage.id}`);
    console.log('\n💡 L\'intégration Notion fonctionne correctement!\n');

    // Supprimer l'entrée test
    try {
      await notion.pages.update({
        page_id: testPage.id,
        archived: true,
      });
      console.log('🗑️  Entrée test supprimée\n');
    } catch (e) {
      console.log('⚠️  Impossible de supprimer l\'entrée test (veuillez la supprimer manuellement)\n');
    }
  } catch (error: any) {
    console.error('❌ Impossible de créer une entrée:', error.message);
    console.error('   Code:', error.code);
    console.error('\n💡 Vérifiez que l\'intégration a les permissions "Insert content"\n');
    process.exit(1);
  }

  console.log('✅ Tous les tests sont passés! L\'intégration Notion est fonctionnelle.\n');
}

diagnoseNotion().catch(console.error);
