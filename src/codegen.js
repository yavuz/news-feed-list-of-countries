#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';
import pLimit from 'p-limit';
import countries from 'i18n-iso-countries';
import { createRequire } from 'module';
import { validateFeed, generateStatisticsBlock, PARALLEL_WORKERS } from './utils.js';

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
    const countryName = countries.getName(code, 'en') || code;
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
  const countryName = countries.getName(countryCode, 'en') || countryCode;
  let section = `## ${countryName}\n\n`;

  publications.forEach(pub => {
    let statusIcon;
    if (pub.isValid === 'bot_protected') {
      statusIcon = '⚠️';
    } else if (pub.isValid === true) {
      statusIcon = '✅';
    } else {
      statusIcon = '❌';
    }
    const categoryText = pub.category ? ` ${pub.category}` : '';
    section += `- ${statusIcon} [${pub.publication_name}](${pub.publication_website_uri})${categoryText} - [Feed](${pub.publication_rss_feed_uri})\n`;
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

  // Split countries into chunks for each worker
  const allCountries = Object.keys(data);
  const chunkSize = Math.ceil(allCountries.length / PARALLEL_WORKERS);
  const countryChunks = [];

  for (let i = 0; i < PARALLEL_WORKERS; i++) {
    const start = i * chunkSize;
    const chunk = allCountries.slice(start, start + chunkSize);
    if (chunk.length > 0) {
      countryChunks.push(chunk);
    }
  }

  // Calculate feeds per worker for progress bars
  const feedsPerWorker = countryChunks.map(chunk =>
    chunk.reduce((sum, country) => sum + data[country].length, 0)
  );

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
          // Skip validation if bot_protection is true
          let isValid = false;
          if (pub.bot_protection === true) {
            isValid = 'bot_protected'; // Special status for bot-protected feeds
          } else {
            isValid = await validateFeed(
              pub.publication_rss_feed_uri,
              pub.publication_name,
              !enableLogging // silent mode when logging is disabled
            );
          }

          validatedPublications.push({
            ...pub,
            isValid
          });

          // Update progress bar for this worker
          if (progressBars[workerIndex]) {
            progressBars[workerIndex].increment();
          }
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
      validFeeds += publications.filter(p => p.isValid === true).length;
    });
  });

  // Generate markdown content
  console.log('\n📝 Generating README.md file...');

  // Sort country codes by their English names
  const countryCodes = Object.keys(validatedData).sort((a, b) => {
    const nameA = countries.getName(a, 'en') || a;
    const nameB = countries.getName(b, 'en') || b;
    return nameA.localeCompare(nameB);
  });

  let markdown = '# AUTO-GENERATED: DO NOT MODIFY MANUALLY\n\n';
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
    // For active feeds JSON - include valid feeds and bot-protected feeds
    const activeFeeds = validatedData[countryCode]
      .filter(pub => pub.isValid === true || pub.isValid === 'bot_protected')
      .map(pub => {
        const feed = {
          publication_name: pub.publication_name,
          publication_website_uri: pub.publication_website_uri,
          publication_rss_feed_uri: pub.publication_rss_feed_uri
        };
        // Include bot_protection flag if present
        if (pub.bot_protection === true) {
          feed.bot_protection = true;
        }
        return feed;
      });

    if (activeFeeds.length > 0) {
      activeFeedsJson[countryCode] = activeFeeds;
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
