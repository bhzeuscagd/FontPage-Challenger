import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
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

    const { subscriptionId, isFavorite } = await request.json();

    if (!subscriptionId) {
      return new Response(JSON.stringify({ error: 'Subscription ID is required' }), { status: 400 });
    }

    const { data, error } = await userSupabase
      .from('feed_subscriptions')
      .update({ is_favorite: isFavorite })
      .eq('id', subscriptionId)
      .eq('user_id', user.id) // Security check
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
