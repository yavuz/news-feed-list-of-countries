Popular news feed sources of the countries
===================

![News](news.jpg)

### About the Project

This repository is dedicated to compiling media and news sources from countries around the world. It contains links to popular news websites and RSS feeds for each country, aiming to provide users easy access to these resources and keep them updated with current news.

#### Invitation to Contribute
If you have information about news sources related to your country, we would love for you to contribute to this project! Feel free to add media links or feed links, update existing information, or suggest new sources. Any support you provide will help enrich our project.

#### Collaboration and Support
By sharing your knowledge of news sources, we can strengthen this project together. Your contributions will help more people access accurate information.

Please contribute to making the flow of news around the world more accessible!

Thank you!

----------

## How to Contribute

Follow these steps to add your RSS feed:

1. **Add your RSS feed** to the respective country in `database/news-feed-list-of-countries.json`
   - Find your country in the JSON file
   - Add your publication details following the existing format:
     ```json
     {
       "publication_name": "Your Publication Name",
       "publication_website_uri": "https://yourwebsite.com",
       "publication_rss_feed_uri": "https://yourwebsite.com/rss"
     }
     ```

2. **Execute the codegen script** which will validate your feed and generate the README.md:
   ```bash
   ./codegen.sh
   ```

   **⚠️ WARNING**: This script will query **every single RSS feed endpoint** in the database to validate them. This means it will make HTTP requests to hundreds of news websites from your IP address. We strongly recommend using a VPN for privacy and to avoid potential rate limiting or IP blocking issues.

   - This script will validate all RSS feeds (including yours)
   - It will regenerate the README.md with your addition
   - Check the output to ensure your feed passed validation

3. **Submit your changes**:
   ```bash
   git add .
   git commit -m "Add [Your Publication] for [Country]"
   git push
   ```

### Feed Validation

Your RSS feed must meet these criteria:
- The feed URL must be publicly accessible
- The feed should be valid RSS/Atom format
- The feed should have been updated recently

If your feed fails validation, check:
- Is the RSS feed URL correct?
- Is the feed publicly accessible?
- Is the feed actively maintained?

**⚠️ IMPORTANT**: Validation failures can also occur due to your local computer's network connection, DNS issues, firewall settings, or temporary internet connectivity problems. Before raising a PR with failed feeds marked as invalid, please:
- Verify your internet connection is stable
- Try running the validation script multiple times
- Test the feed URL manually in your browser
- Consider that timeouts or network errors may not reflect the actual feed status

Be careful and thorough before submitting changes that mark feeds as invalid or remove them.
