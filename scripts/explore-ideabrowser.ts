#!/usr/bin/env tsx
/**
 * Script d'exploration pour comprendre la structure d'ideabrowser.com
 */

import puppeteer from 'puppeteer';

async function explore() {
  console.log('🔍 Lancement de l\'exploration d\'ideabrowser.com...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Configuration viewport
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    const url = 'https://www.ideabrowser.com';
    console.log(`📄 Chargement de ${url}...`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ Page chargée avec succès\n');

    // Extraire des informations sur la structure
    const pageInfo = await page.evaluate(() => {
      const info: any = {
        title: document.title,
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 500),

        // Chercher les sections principales
        sections: [] as string[],

        // Chercher les éléments contenant "Business Fit"
        businessFitElements: [] as any[],

        // Chercher les éléments contenant "keyword" ou "volume"
        keywordElements: [] as any[],

        // Chercher les éléments de catégorisation
        categorizationElements: [] as any[],

        // Scripts Next.js
        hasNextData: !!document.getElementById('__NEXT_DATA__'),

        // Classes CSS principales utilisées
        mainClasses: [] as string[]
      };

      // Récupérer toutes les sections/articles
      const articles = document.querySelectorAll('article, section, main, [role="main"]');
      articles.forEach(el => {
        const className = el.className;
        const id = el.id;
        if (className || id) {
          info.sections.push(`${el.tagName}: ${className || id}`);
        }
      });

      // Chercher "Business Fit"
      const allText = document.body.innerText.toLowerCase();
      if (allText.includes('business fit')) {
        info.businessFitElements.push('Found "Business Fit" in text');

        // Chercher les éléments contenant ce texte
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );

        let node;
        let count = 0;
        while (node = walker.nextNode()) {
          if (count > 50) break;
          const text = node.textContent?.toLowerCase() || '';
          if (text.includes('opportunit') || text.includes('problem') || text.includes('feasibility')) {
            const parent = node.parentElement;
            if (parent) {
              info.businessFitElements.push({
                tag: parent.tagName,
                class: parent.className,
                text: text.substring(0, 100)
              });
            }
            count++;
          }
        }
      }

      // Chercher éléments de keywords
      const keywordCandidates = document.querySelectorAll('[class*="keyword"], [class*="volume"], [class*="growth"], [data-chart]');
      keywordCandidates.forEach((el, idx) => {
        if (idx < 10) {
          info.keywordElements.push({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.substring(0, 100)
          });
        }
      });

      // Chercher éléments de catégorisation
      if (allText.includes('type') || allText.includes('market') || allText.includes('target')) {
        const catElements = document.querySelectorAll('[class*="categor"], [class*="type"], [class*="market"]');
        catElements.forEach((el, idx) => {
          if (idx < 10) {
            info.categorizationElements.push({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.substring(0, 100)
            });
          }
        });
      }

      // Classes CSS principales
      const allElements = document.querySelectorAll('[class]');
      const classMap = new Map<string, number>();
      allElements.forEach(el => {
        const className = el.getAttribute('class');
        if (className && typeof className === 'string') {
          const classes = className.split(' ');
          classes.forEach(cls => {
            if (cls && cls.length > 2) {
              classMap.set(cls, (classMap.get(cls) || 0) + 1);
            }
          });
        }
      });

      const sortedClasses = Array.from(classMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      info.mainClasses = sortedClasses.map(([cls, count]) => `${cls} (${count}x)`);

      return info;
    });

    // Afficher les résultats
    console.log('📊 RÉSULTATS DE L\'EXPLORATION\n');
    console.log('═'.repeat(80));

    console.log('\n🎯 INFORMATIONS GÉNÉRALES');
    console.log(`Titre: ${pageInfo.title}`);
    console.log(`URL: ${pageInfo.url}`);
    console.log(`Has __NEXT_DATA__: ${pageInfo.hasNextData}`);

    console.log('\n📝 DÉBUT DU CONTENU:');
    console.log(pageInfo.bodyText);

    console.log('\n🏗️ SECTIONS PRINCIPALES:');
    pageInfo.sections.slice(0, 10).forEach((s: string) => console.log(`  - ${s}`));

    console.log('\n💼 BUSINESS FIT ELEMENTS:');
    if (pageInfo.businessFitElements.length > 0) {
      pageInfo.businessFitElements.slice(0, 10).forEach((el: any) => {
        if (typeof el === 'string') {
          console.log(`  - ${el}`);
        } else {
          console.log(`  - ${el.tag}.${el.class}: ${el.text}`);
        }
      });
    } else {
      console.log('  ⚠️ Aucun élément Business Fit trouvé');
    }

    console.log('\n🔑 KEYWORD ELEMENTS:');
    if (pageInfo.keywordElements.length > 0) {
      pageInfo.keywordElements.forEach((el: any) => {
        console.log(`  - ${el.tag}.${el.class}: ${el.text}`);
      });
    } else {
      console.log('  ⚠️ Aucun élément keyword trouvé');
    }

    console.log('\n📊 CATEGORIZATION ELEMENTS:');
    if (pageInfo.categorizationElements.length > 0) {
      pageInfo.categorizationElements.forEach((el: any) => {
        console.log(`  - ${el.tag}.${el.class}: ${el.text}`);
      });
    } else {
      console.log('  ⚠️ Aucun élément categorization trouvé');
    }

    console.log('\n🎨 CLASSES CSS PRINCIPALES:');
    pageInfo.mainClasses.forEach((cls: string) => console.log(`  - ${cls}`));

    console.log('\n═'.repeat(80));

    // Prendre un screenshot
    const screenshotPath = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/ideabrowser-screenshot.png';
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    console.log(`\n📸 Screenshot sauvegardé: ${screenshotPath}`);

    // Sauvegarder le HTML complet
    const html = await page.content();
    const htmlPath = '/Users/lucas/Dévelopement/PowerGlove/ZeroCase/MindRipper/scripts/ideabrowser-page.html';
    const fs = await import('fs');
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML sauvegardé: ${htmlPath}`);

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await browser.close();
  }
}

explore();
