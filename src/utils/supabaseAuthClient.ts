import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseAuthClient(): SupabaseClient {
  const url = import.meta.env.SUPABASE_URL;
  const publishableKey = import.meta.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Supabase URL and publishable key must be configured for Supabase Auth login.');
  }
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}
