#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';
import pLimit from 'p-limit';
import countries from 'i18n-iso-countries';
import { createRequire } from 'module';
import { validateFeed, generateStatisticsBlock, PARALLEL_WORKERS } from './utils.js';
import { initLanguageDetector } from './language-detection.js';

const require = createRequire(import.meta.url);
const en = require('i18n-iso-countries/langs/en.json');

// Register English locale for country names
countries.registerLocale(en);

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_JSON = path.join(__dirname, '..', 'database', 'news-feed-list-of-countries.json');
const OUTPUT_README = path.join(__dirname, '..', 'README.md');
const OUTPUT_JSON_ACTIVE = path.join(__dirname, '..', 'active-feeds-auto-generated.json');

/**
 * Generates a markdown slug from a country name
 * @param {string} country - The country name
 * @returns {string} - The slugified country name
 */
function slugify(country) {
  return country
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

/**
 * Generates the Table of Contents for the markdown file
 * @param {Array<string>} countryCodes - List of country Alpha-3 codes
 * @returns {string} - The TOC markdown string
 */
function generateTableOfContents(countryCodes) {
  let toc = '## Table of Contents\n';
  countryCodes.forEach(code => {
    const countryName = code === 'GLOBAL' ? 'Global' : (countries.getName(code, 'en') || code);
    toc += `- [${countryName}](#${slugify(countryName)})\n`;
  });
  return toc + '\n';
}

/**
 * Generates the markdown content for a single country
 * @param {string} countryCode - The country Alpha-3 code
 * @param {Array<Object>} publications - List of publications with validation status
 * @returns {string} - The markdown content for the country section
 */
function generateCountrySection(countryCode, publications) {
  const countryName = countryCode === 'GLOBAL' ? 'Global' : (countries.getName(countryCode, 'en') || countryCode);
  let section = `## ${countryName}\n\n`;

  publications.forEach(pub => {
    pub.publication_rss_feed_uris.forEach(feedObj => {
      let statusIcon;
      if (feedObj.isValid === 'bot_protected') {
        statusIcon = '⚠️';
      } else if (feedObj.isValid === true) {
        statusIcon = '✅';
      } else {
        statusIcon = '❌';
      }
      const categoryText = feedObj.category ? ` ${feedObj.category}` : '';
      const languageText = feedObj.language_name ? ` - ${feedObj.language_name}` : '';
      section += `- ${statusIcon} [${pub.publication_name}](${pub.publication_website_uri})${categoryText} - [Feed](${feedObj.uri})${languageText}\n`;
    });
  });

  section += '\n';
  return section;
}

/**
 * Main function to generate the README.md file with feed validation
 */
async function generateMarkdown() {
  // Check for -log parameter
  const enableLogging = process.argv.includes('-log') || process.argv.includes('--log');

  await initLanguageDetector();

  console.log('🚀 Starting feed validation and markdown generation...\n');
  console.log(`⚙️  Using ${PARALLEL_WORKERS} parallel workers for faster processing\n`);
  if (enableLogging) {
    console.log('📋 Logging enabled - detailed feed validation logs will be shown\n');
  }

  // Read the JSON file
  let data;
  try {
    const jsonContent = fs.readFileSync(INPUT_JSON, 'utf8');
    data = JSON.parse(jsonContent);
  } catch (error) {
    console.error(`❌ Error reading JSON file: ${error.message}`);
    process.exit(1);
  }

  const validatedData = {};
  let totalFeeds = 0;
  let validFeeds = 0;

  // Helper to count total feed URIs for a country
  const countFeeds = (pubs) => pubs.reduce((sum, pub) => sum + pub.publication_rss_feed_uris.length, 0);

  // Sort countries by feed count (descending) for better distribution
  const allCountries = Object.keys(data).sort((a, b) => countFeeds(data[b]) - countFeeds(data[a]));

  // Initialize worker chunks with feed counts
  const countryChunks = Array.from({ length: PARALLEL_WORKERS }, () => []);
  const feedsPerWorker = Array(PARALLEL_WORKERS).fill(0);

  // Distribute countries using greedy algorithm - assign each country to the worker with fewest feeds
  for (const country of allCountries) {
    const feedCount = countFeeds(data[country]);
    // Find worker with minimum feeds
    let minWorkerIndex = 0;
    for (let i = 1; i < PARALLEL_WORKERS; i++) {
      if (feedsPerWorker[i] < feedsPerWorker[minWorkerIndex]) {
        minWorkerIndex = i;
      }
    }
    countryChunks[minWorkerIndex].push(country);
    feedsPerWorker[minWorkerIndex] += feedCount;
  }

  totalFeeds = feedsPerWorker.reduce((a, b) => a + b, 0);

  // Create multi-progress bar (only if logging is disabled)
  let multibar = null;
  const progressBars = [];

  if (!enableLogging) {
    multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: 'Worker {worker} |{bar}| {percentage}% | {value}/{total} feeds'
    }, cliProgress.Presets.shades_classic);

    // Create a progress bar for each worker
    feedsPerWorker.forEach((feedCount, index) => {
      const bar = multibar.create(feedCount, 0, { worker: index + 1 });
      progressBars.push(bar);
    });
  }

  // Create concurrency limiter
  const limit = pLimit(PARALLEL_WORKERS);

  // Process each chunk of countries with its own progress bar
  const chunkPromises = countryChunks.map((chunk, workerIndex) =>
    limit(async () => {
      const results = {};

      for (const country of chunk) {
        const publications = data[country];
        const validatedPublications = [];

        for (const pub of publications) {
          const validatedUris = [];

          for (const feedObj of pub.publication_rss_feed_uris) {
            let isValid = false;
            let language_code = null;
            let language_name = null;
            if (feedObj.bot_protection === true) {
              isValid = 'bot_protected';
            } else {
              ({ isValid, language_code, language_name } = await validateFeed(
                feedObj.uri,
                pub.publication_name + (feedObj.category ? ` (${feedObj.category})` : ''),
                !enableLogging
              ));
            }

            validatedUris.push({ ...feedObj, isValid, language_code, language_name });

            if (progressBars[workerIndex]) {
              progressBars[workerIndex].increment();
            }
          }

          validatedPublications.push({
            ...pub,
            publication_rss_feed_uris: validatedUris
          });
        }

        results[country] = validatedPublications;
      }

      return results;
    })
  );

  // Wait for all chunks to complete
  const allResults = await Promise.all(chunkPromises);

  // Stop all progress bars
  if (multibar) {
    multibar.stop();
  }

  // Merge results from all workers
  allResults.forEach(workerResults => {
    Object.entries(workerResults).forEach(([country, publications]) => {
      validatedData[country] = publications;
      validFeeds += publications.reduce(
        (sum, pub) => sum + pub.publication_rss_feed_uris.filter(f => f.isValid === true).length, 0
      );
    });
  });

  // Generate markdown content
  console.log('\n📝 Generating README.md file...');

  // Sort country codes by their English names, with GLOBAL at the end
  const countryCodes = Object.keys(validatedData).sort((a, b) => {
    // GLOBAL should always be at the end
    if (a === 'GLOBAL') return 1;
    if (b === 'GLOBAL') return -1;
    const nameA = countries.getName(a, 'en') || a;
    const nameB = countries.getName(b, 'en') || b;
    return nameA.localeCompare(nameB);
  });

  let markdown = '# 🌍 Global News Feeds by Country\n\n';
  markdown += '> A curated, automated directory of 1,200+ news publications and RSS feeds across 140 countries.\n\n';
  markdown += '[![Maintained by Yavuz](https://img.shields.io/badge/maintained%20by-yavuz-blue.svg)](https://github.com/yavuz)\n';
  markdown += '[![Data Project](https://img.shields.io/badge/open%20data-VeriNokta-emerald.svg)](https://verinokta.com)\n\n';
  markdown += '---\n\n';
  markdown += '💡 **Related Open Data & Analytics:**  \n';
  markdown += 'Looking for official Turkish economic indicators, TÜİK inflation data, and public calculation utilities?  \n';
  markdown += 'Visit **[VeriNokta](https://verinokta.com)** — Türkiye Açık Veri, Enflasyon ve Kamu Göstergeleri Portalı.\n\n';
  markdown += '---\n\n';
  markdown += '# AUTO-GENERATED: DO NOT MODIFY MANUALLY\n\n';
  markdown += '**See [CONTRIBUTION.md](CONTRIBUTION.md) for instructions on how to contribute.**\n\n';
  markdown += '----------\n\n';

  // Add legend
  markdown += '## Legend\n\n';
  markdown += '- ✅ **Valid Feed** - Feed is accessible and has been updated within the last 24 hours\n';
  markdown += '- ❌ **Invalid/Outdated Feed** - Feed is inaccessible, malformed, or hasn\'t been updated in over 24 hours\n';
  markdown += '- ⚠️ **Bot Protected** - Feed is behind bot protection and cannot be validated automatically\n\n';

  markdown += generateTableOfContents(countryCodes);

  countryCodes.forEach(countryCode => {
    markdown += generateCountrySection(countryCode, validatedData[countryCode]);
  });

  // Prepare JSON data for active feeds only
  const activeFeedsJson = {};

  countryCodes.forEach(countryCode => {
    const activePublications = [];

    validatedData[countryCode].forEach(pub => {
      const activeUris = pub.publication_rss_feed_uris
        .filter(feedObj => feedObj.isValid === true || feedObj.isValid === 'bot_protected')
        .map(feedObj => {
          const uriEntry = { uri: feedObj.uri };
          if (feedObj.category) uriEntry.category = feedObj.category;
          if (feedObj.bot_protection === true) uriEntry.bot_protection = true;
          if (feedObj.language_code) uriEntry.language_code = feedObj.language_code;
          if (feedObj.language_name) uriEntry.language_name = feedObj.language_name;
          return uriEntry;
        });

      if (activeUris.length > 0) {
        activePublications.push({
          publication_name: pub.publication_name,
          publication_website_uri: pub.publication_website_uri,
          publication_rss_feed_uris: activeUris
        });
      }
    });

    if (activePublications.length > 0) {
      activeFeedsJson[countryCode] = activePublications;
    }
  });

  // Add statistics block at the end
  markdown += generateStatisticsBlock(Object.keys(activeFeedsJson).length, totalFeeds, validFeeds);

  // Write to files
  try {
    // Write README.md
    fs.writeFileSync(OUTPUT_README, markdown, 'utf8');
    console.log(`\n✅ Successfully generated ${OUTPUT_README}`);

    // Write active feeds JSON
    fs.writeFileSync(OUTPUT_JSON_ACTIVE, JSON.stringify(activeFeedsJson, null, 2), 'utf8');
    console.log(`✅ Successfully generated ${OUTPUT_JSON_ACTIVE}`);

    console.log(`\n📊 Summary:`);
    console.log(`   Total feeds processed: ${totalFeeds}`);
    console.log(`   Valid feeds (✅): ${validFeeds}`);
    console.log(`   Invalid/Outdated feeds (❌): ${totalFeeds - validFeeds}`);
    console.log(`   Countries included: ${countryCodes.length}`);
    console.log(`   Countries with active feeds: ${Object.keys(activeFeedsJson).length}`);
    console.log(`   Success rate: ${((validFeeds / totalFeeds) * 100).toFixed(1)}%`);

    // Exit successfully
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error writing output files: ${error.message}`);
    process.exit(1);
  }
}

// Run the generator
generateMarkdown().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});