#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { validateFeed, processInParallel, PARALLEL_WORKERS } = require('./utils');

const README_PATH = path.join(__dirname, '..', 'README.md');
const OUTPUT_JSON = path.join(__dirname, 'news-feed-list-of-countries.json');

/**
 * Parses the README.md file and extracts country and publication data
 * Validates RSS feeds in parallel and only includes valid entries
 */
async function parseReadme() {
  console.log('🚀 Starting migration from README.md to JSON...\n');
  console.log(`⚙️  Using ${PARALLEL_WORKERS} parallel workers for feed validation\n`);

  // Read the README file
  let content;
  try {
    content = fs.readFileSync(README_PATH, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading README.md: ${error.message}`);
    process.exit(1);
  }

  const lines = content.split('\n');
  const parsedData = {};
  let currentCountry = null;
  let totalParsed = 0;

  // First pass: Parse all publications from README
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match country headers (## Country Name)
    if (line.startsWith('## ') && !line.startsWith('## Table of Contents')) {
      currentCountry = line.substring(3).trim();
      parsedData[currentCountry] = [];
      console.log(`📍 Found country: ${currentCountry}`);
      continue;
    }

    // Match publication lines: - [Publication Name](url) - [Feed](feed_url)
    // Also handle lines with status icons (✅ or ❌)
    if (currentCountry && line.match(/^- (\✅|\❌)?\s*\[/)) {
      const publicationMatch = line.match(/^- (?:\✅|\❌)?\s*\[([^\]]+)\]\(([^\)]+)\)\s*-\s*\[Feed\]\(([^\)]+)\)/);

      if (publicationMatch) {
        const [, name, websiteUri, feedUri] = publicationMatch;

        parsedData[currentCountry].push({
          publication_name: name,
          publication_website_uri: websiteUri,
          publication_rss_feed_uri: feedUri
        });

        totalParsed++;
      }
    }
  }

  console.log(`\n📊 Parsed ${totalParsed} publications from ${Object.keys(parsedData).length} countries`);
  console.log(`\n🔍 Starting feed validation...\n`);

  // Second pass: Validate feeds in parallel
  const validatedData = {};
  let totalValid = 0;
  let totalInvalid = 0;

  for (const [country, publications] of Object.entries(parsedData)) {
    console.log(`\n📍 Validating feeds for ${country}...`);

    // Create tasks for parallel processing
    const tasks = publications.map(pub => ({
      publication: pub,
      country: country
    }));

    // Process feeds in parallel with worker pool
    const results = await processInParallel(
      tasks,
      async (task) => {
        const isValid = await validateFeed(
          task.publication.publication_rss_feed_uri,
          task.publication.publication_name
        );
        return {
          publication: task.publication,
          isValid: isValid
        };
      },
      PARALLEL_WORKERS
    );

    // Only add valid publications to the final data
    const validPublications = results
      .filter(r => r.isValid)
      .map(r => r.publication);

    if (validPublications.length > 0) {
      validatedData[country] = validPublications;
      totalValid += validPublications.length;
    }

    totalInvalid += results.filter(r => !r.isValid).length;
  }

  console.log(`\n✅ Migration and validation complete!`);
  console.log(`📊 Summary:`);
  console.log(`   Countries with valid feeds: ${Object.keys(validatedData).length}`);
  console.log(`   Total publications parsed: ${totalParsed}`);
  console.log(`   Valid feeds (✅): ${totalValid}`);
  console.log(`   Invalid/Outdated feeds (❌): ${totalInvalid}`);
  console.log(`   Success rate: ${((totalValid / totalParsed) * 100).toFixed(1)}%`);

  return validatedData;
}

/**
 * Main migration function
 */
async function migrate() {
  const data = await parseReadme();

  // Write to JSON file
  try {
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✅ Successfully wrote validated data to ${OUTPUT_JSON}`);
  } catch (error) {
    console.error(`❌ Error writing JSON file: ${error.message}`);
    process.exit(1);
  }
}

// Run the migration
migrate().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});
