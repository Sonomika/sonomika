import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Minimal cross-process storage backed by Electron main via preload
function createElectronStorageAdapter() {
  const hasAuthStorage = typeof window !== 'undefined' && (window as any).authStorage;
  return {
    getItem: (k: string): string | null => {
      if (!hasAuthStorage) return window.localStorage.getItem(k);
      return (window as any).authStorage.loadSync(k);
    },
    setItem: (k: string, value: string): void => {
      if (!hasAuthStorage) {
        window.localStorage.setItem(k, value);
        return;
      }
      (window as any).authStorage.saveSync(k, value);
    },
    removeItem: (k: string): void => {
      if (!hasAuthStorage) {
        window.localStorage.removeItem(k);
        return;
      }
      (window as any).authStorage.removeSync(k);
    },
  };
}

export const getSupabase = (): SupabaseClient => {
  if (client) return client;
  const env = (import.meta as any).env || {};
  const url = env.VITE_SUPABASE_URL || (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) || '';
  const anon = env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) || '';
  if (!url || !anon) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for web builds.');
  }
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: isElectron ? (createElectronStorageAdapter() as any) : undefined,
    },
  });
  return client;
};


