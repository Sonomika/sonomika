// Supabase client configuration - Environment variables configured for Vercel deployment
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (client) return client;
  const env = (import.meta as any).env || {};
  const url = env.VITE_SUPABASE_URL || (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) || '';
  const anon = env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) || '';
  if (!url || !anon) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for web builds.');
  }
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
};


