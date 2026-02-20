import type { APIRoute } from 'astro';
import { fetchFeed } from '../../../lib/feed-parser';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const feedUrl = url.searchParams.get('url');

    if (!feedUrl) {
      return new Response(JSON.stringify({ error: 'Feed URL is required' }), { status: 400 });
    }

    if (feedUrl === 'all') {
      // 1. Check authentication
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.split(' ')[1];

      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      const { createClient } = await import('@supabase/supabase-js');
      const userSupabase = createClient(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );

      const { data: { user }, error: authError } = await userSupabase.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      // 2. Fetch all user subscriptions
      const { data: subs, error: subsError } = await userSupabase
        .from('feed_subscriptions')
        .select('feeds(url)')
        .eq('user_id', user.id);

      if (subsError) throw subsError;

      // 3. Fetch all feeds in parallel
      const feedUrls = (subs || []).map((s: any) => s.feeds.url);
      const feedResults = await Promise.allSettled(feedUrls.map(u => fetchFeed(u)));

      // 4. Aggregate and sort items
      let allItems: any[] = [];
      feedResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const feedContent = result.value;
          const itemsWithMetadata = feedContent.items.map((item: any) => ({
            ...item,
            feedTitle: feedContent.title,
            feedUrl: feedContent.feedUrl // Source URL
          }));
          allItems = allItems.concat(itemsWithMetadata);
        }
      });

      // Sort by pubDate descending
      allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      return new Response(JSON.stringify({
        title: 'All Subscriptions',
        items: allItems
      }), { status: 200 });
    }

    const feed = await fetchFeed(feedUrl);
    return new Response(JSON.stringify(feed), { status: 200 });
  } catch (error) {
    console.error('Error proxying feed:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch feed' }), { status: 500 });
  }
};
