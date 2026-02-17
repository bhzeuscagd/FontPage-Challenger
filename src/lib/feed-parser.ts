import Parser from 'rss-parser';

// Configure the parser with default settings
const parser = new Parser({
  timeout: 5000, // 5 seconds timeout
  customFields: {
    item: [
      ['media:content', 'media'],
      ['media:thumbnail', 'thumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

export interface ValidatedFeed {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  lastBuildDate?: string;
  items: FeedItem[];
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  author?: string;
  imageUrl?: string;
  categories?: string[];
}

/**
 * Fetches and parses an RSS/Atom feed from a URL.
 * Normalizes the output to a standard format.
 */
export async function fetchFeed(url: string): Promise<ValidatedFeed> {
  try {
    const feed = await parser.parseURL(url);

    // Normalize feed items
    const items: FeedItem[] = feed.items.map((item) => {
      // Extract image from various possible sources
      let imageUrl = item.enclosure?.url;
      
      // Try media:content or media:thumbnail if enclosure is missing
      if (!imageUrl && item['media']) {
        imageUrl = item['media']?.['$']?.url;
      }
      if (!imageUrl && item['thumbnail']) {
        imageUrl = item['thumbnail']?.['$']?.url;
      }

      // Fallback: Try to extract first image from content
      if (!imageUrl && (item.contentEncoded || item.content)) {
        const imgMatch = (item.contentEncoded || item.content)?.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }

      return {
        guid: item.guid || item.link || item.title || crypto.randomUUID(), // Ensure GUID exists
        title: item.title || 'Untitled',
        link: item.link || '',
        pubDate: item.pubDate || new Date().toISOString(),
        content: item.contentEncoded || item.content || item.contentSnippet || '',
        contentSnippet: item.contentSnippet || '',
        author: item.creator || item.author || '',
        imageUrl,
        categories: item.categories,
      };
    });

    return {
      title: feed.title || 'Unknown Feed',
      description: feed.description || '',
      siteUrl: feed.link || '',
      feedUrl: url,
      lastBuildDate: feed.lastBuildDate,
      items,
    };
  } catch (error) {
    console.error(`Error parsing feed ${url}:`, error);
    throw new Error(`Failed to parse feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
