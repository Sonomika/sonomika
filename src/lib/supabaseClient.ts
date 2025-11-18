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
  // Skip Supabase in Electron mode
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  if (isElectron) {
    // Return a no-op client stub for Electron
    const stubUrl = 'https://disabled.supabase.co';
    const stubKey = 'disabled';
    if (!client) {
      client = createClient(stubUrl, stubKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: undefined,
        },
      });
    }
    return client;
  }

  if (client) return client;
  const env = (import.meta as any).env || {};
  const url = env.VITE_SUPABASE_URL || (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) || '';
  const anon = env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) || '';
  if (!url || !anon) {
    // Return a no-op client stub instead of throwing
    const stubUrl = 'https://disabled.supabase.co';
    const stubKey = 'disabled';
    client = createClient(stubUrl, stubKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: undefined,
      },
    });
    return client;
  }
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: false, // Disabled to prevent refresh attempts on disabled accounts
      detectSessionInUrl: true,
      storage: undefined,
    },
  });
  return client;
};


