import Parser from 'rss-parser';

// RSS Parser configuration
const parser = new Parser({
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS Feed Validator/1.0)',
  },
});

// Constants
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const PARALLEL_WORKERS = 5;

/**
 * Validates if a feed exists and has been updated within the last 24 hours
 * @param {string} feedUrl - The RSS feed URL to validate
 * @param {string} publicationName - The name of the publication for logging
 * @param {boolean} silent - If true, suppress console output
 * @returns {Promise<boolean>} - True if feed is valid and recent, false otherwise
 */
export async function validateFeed(feedUrl, publicationName, silent = false) {
  try {
    // Parse the RSS feed directly from URL
    const feed = await parser.parseURL(feedUrl);

    // Check lastBuildDate
    const lastBuildDate = feed.lastBuildDate || feed.pubDate || (feed.items[0] && feed.items[0].pubDate);

    if (!lastBuildDate) {
      if (!silent) console.error(`❌ [${publicationName}] No lastBuildDate found in feed: ${feedUrl}`);
      return false;
    }

    const lastUpdate = new Date(lastBuildDate);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    if (now - lastUpdate > TWENTY_FOUR_HOURS_MS) {
      if (!silent) console.error(`❌ [${publicationName}] Feed outdated (${hoursSinceUpdate.toFixed(1)} hours old): ${feedUrl}`);
      return false;
    }

    if (!silent) console.log(`✅ [${publicationName}] Valid feed (updated ${hoursSinceUpdate.toFixed(1)} hours ago)`);
    return true;

  } catch (error) {
    if (!silent) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error(`❌ [${publicationName}] Feed URL not reachable: ${feedUrl}`);
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error(`❌ [${publicationName}] Feed request timeout: ${feedUrl}`);
      } else {
        console.error(`❌ [${publicationName}] Error validating feed: ${feedUrl} - ${error.message}`);
      }
    }
    return false;
  }
}

/**
 * Generates statistics block for the README
 * @param {number} countriesWithValidFeeds - Number of countries with at least one valid feed
 * @param {number} totalFeeds - Total number of publications parsed
 * @param {number} validFeeds - Number of valid feeds
 * @returns {string} - The statistics markdown block
 */
export function generateStatisticsBlock(countriesWithValidFeeds, totalFeeds, validFeeds) {
  const invalidFeeds = totalFeeds - validFeeds;
  const successRate = ((validFeeds / totalFeeds) * 100).toFixed(1);

  return `## Statistics

\`\`\`
Countries with valid feeds: ${countriesWithValidFeeds}
Total publications parsed: ${totalFeeds}
Valid feeds (✅): ${validFeeds}
Invalid/Outdated feeds (❌): ${invalidFeeds}
Success rate: ${successRate}%
\`\`\`
`;
}

