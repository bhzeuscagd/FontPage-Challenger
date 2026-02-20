import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { fetchFeed } from '../../../lib/feed-parser';

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Check authentication
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Create a scoped client with the user's token to satisfy RLS
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

    // Use userSupabase for all subsequent database calls
    const supabaseClient = userSupabase;

    // 2. Parse request body
    const { url, categoryId } = await request.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });
    }

    // 3. Validate and parse the feed
    let validatedFeed;
    try {
      validatedFeed = await fetchFeed(url);
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: 'Invalid feed URL. Please ensure it is a valid RSS or Atom feed.' 
      }), { status: 400 });
    }

    // 4. Handle Feeds table (Source of Truth)
    // Check if feed exists first
    let { data: existingFeed } = await supabaseClient
      .from('feeds')
      .select('id')
      .eq('url', url)
      .single();

    let feedId;
    if (existingFeed) {
      feedId = existingFeed.id;
    } else {
      // Insert new global feed
      const { data: newFeed, error: feedError } = await supabaseClient
        .from('feeds')
        .insert([
          {
            url: url,
            title: validatedFeed.title,
            description: validatedFeed.description,
            site_url: validatedFeed.siteUrl,
          }
        ])
        .select()
        .single();
      
      if (feedError) throw feedError;
      feedId = newFeed.id;
    }

    // 5. Handle Subscription (User Link)
    const { data: subscription, error: subError } = await supabaseClient
      .from('feed_subscriptions')
      .insert([
        {
          user_id: user.id,
          feed_id: feedId,
          category_id: categoryId || null,
        }
      ])
      .select()
      .single();

    if (subError) {
      if (subError.code === '23505') { // Unique constraint: (user_id, feed_id)
        return new Response(JSON.stringify({ error: 'You are already subscribed to this feed.' }), { status: 400 });
      }
      throw subError;
    }

    return new Response(JSON.stringify(subscription), { status: 201 });
  } catch (error) {
    console.error('Error adding feed:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error && typeof error === 'object' ? JSON.stringify(error) : String(error) 
    }), { status: 500 });
  }
};
