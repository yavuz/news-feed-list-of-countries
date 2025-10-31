#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');
const { validateFeed, processInParallel, generateStatisticsBlock, PARALLEL_WORKERS } = require('./utils');

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
 * @param {Array<string>} countries - List of country names
 * @returns {string} - The TOC markdown string
 */
function generateTableOfContents(countries) {
  let toc = '## Table of Contents\n';
  countries.forEach(country => {
    toc += `- [${country}](#${slugify(country)})\n`;
  });
  return toc + '\n';
}

/**
 * Generates the markdown content for a single country
 * @param {string} country - The country name
 * @param {Array<Object>} publications - List of publications with validation status
 * @returns {string} - The markdown content for the country section
 */
function generateCountrySection(country, publications) {
  let section = `## ${country}\n\n`;

  publications.forEach(pub => {
    const statusIcon = pub.isValid ? '✅' : '❌';
    section += `- ${statusIcon} [${pub.publication_name}](${pub.publication_website_uri}) - [Feed](${pub.publication_rss_feed_uri})\n`;
  });

  section += '\n';
  return section;
}

/**
 * Main function to generate the README.md file with feed validation
 */
async function generateMarkdown() {
  console.log('🚀 Starting feed validation and markdown generation...\n');
  console.log(`⚙️  Using ${PARALLEL_WORKERS} parallel workers for faster processing\n`);

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

  // Calculate total number of feeds
  const totalFeedsCount = Object.values(data).reduce((sum, pubs) => sum + pubs.length, 0);
  let processedFeeds = 0;

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: 'Validating feeds |{bar}| {percentage}% | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  progressBar.start(totalFeedsCount, 0);

  // Validate all feeds with parallel processing
  for (const [country, publications] of Object.entries(data)) {
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
          task.publication.publication_name,
          true // silent mode - no console logs
        );
        processedFeeds++;
        progressBar.update(processedFeeds);
        return {
          ...task.publication,
          isValid: isValid
        };
      },
      PARALLEL_WORKERS
    );

    // Store all results (both valid and invalid)
    validatedData[country] = results;
    totalFeeds += results.length;
    validFeeds += results.filter(r => r.isValid).length;
  }

  progressBar.stop();

  // Generate markdown content
  console.log('\n📝 Generating README.md file...');

  const countries = Object.keys(validatedData).sort();

  let markdown = '# AUTO-GENERATED: DO NOT MODIFY MANUALLY\n\n';
  markdown += '**See [CONTRIBUTION.md](CONTRIBUTION.md) for instructions on how to contribute.**\n\n';
  markdown += '----------\n\n';

  markdown += generateTableOfContents(countries);

  countries.forEach(country => {
    markdown += generateCountrySection(country, validatedData[country]);
  });

  // Prepare JSON data for active feeds only
  const activeFeedsJson = {};

  countries.forEach(country => {
    // For active feeds JSON - only include valid feeds
    const activeFeeds = validatedData[country]
      .filter(pub => pub.isValid)
      .map(pub => ({
        publication_name: pub.publication_name,
        publication_website_uri: pub.publication_website_uri,
        publication_rss_feed_uri: pub.publication_rss_feed_uri
      }));

    if (activeFeeds.length > 0) {
      activeFeedsJson[country] = activeFeeds;
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
    console.log(`   Countries included: ${countries.length}`);
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
