import { createClient } from '@supabase/supabase-js';
import { getActiveBrand } from './config/brandConfig';

// Ultra-safe environment variable access
const getEnv = (key: string): string | undefined => {
  try {
    // Check if import.meta exists and has env
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return val;
    }
    // Fallback for some process.env environments
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return val;
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
};

const brand = getActiveBrand();
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || brand.defaultSupabaseUrl;
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_KEY') || brand.defaultSupabaseKey;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing. App may not function correctly.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
