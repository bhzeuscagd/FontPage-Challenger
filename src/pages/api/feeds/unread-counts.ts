import type { APIRoute } from 'astro';
import { fetchFeed } from '../../../lib/feed-parser';

export const GET: APIRoute = async ({ request }) => {
  try {
    const isGuestRequest = new URL(request.url).searchParams.get('guest') === 'true';

    if (isGuestRequest) {
      const guestFeeds = [
        {
          id: "guest-1",
          url: "https://www.theverge.com/rss/index.xml"
        }
      ];

      const counts = await Promise.all(guestFeeds.map(async (f) => {
        try {
          const feed = await fetchFeed(f.url);
          return { subscriptionId: f.id, unreadCount: feed.items.length };
        } catch (err) {
          return { subscriptionId: f.id, unreadCount: 0 };
        }
      }));
      return new Response(JSON.stringify(counts), { status: 200 });
    }

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

    // 1. Fetch user subscriptions with feeds
    const { data: subs, error: subsError } = await userSupabase
      .from('feed_subscriptions')
      .select('id, last_read_at, feed_id, feeds(url)')
      .eq('user_id', user.id);

    if (subsError) throw subsError;

    // 1.5 Fetch user's read items
    const { data: readStates, error: readStatesError } = await userSupabase
      .from('user_item_states')
      .select('is_read, feed_items(guid)')
      .eq('user_id', user.id)
      .eq('is_read', true);
      
    if (readStatesError) throw readStatesError;

    // Create a set of guids that are marked as read
    const readGuids = new Set(
      (readStates || []).map((rs: any) => rs.feed_items?.guid).filter(Boolean)
    );

    // 2. Fetch and calculate unread counts for each feed
    const counts = await Promise.all((subs || []).map(async (sub: any) => {
      try {
        const feedUrl = sub.feeds.url;
        const feed = await fetchFeed(feedUrl); // In a production app, we'd use a lightweight fetch here or a cache
        
        const lastRead = new Date(sub.last_read_at || 0).getTime();
        const unreadItems = feed.items.filter((item: any) => {
          if (readGuids.has(item.guid)) return false;
          return new Date(item.pubDate).getTime() > lastRead;
        });

        return {
            subscriptionId: sub.id,
            unreadCount: unreadItems.length
        };
      } catch (err) {
        console.error(`Error calculating unread for ${sub.id}:`, err);
        return { subscriptionId: sub.id, unreadCount: 0 };
      }
    }));

    return new Response(JSON.stringify(counts), { status: 200 });
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
