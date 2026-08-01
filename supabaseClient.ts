
import { createClient } from '@supabase/supabase-js';

// Ultra-safe environment variable access
const getEnv = (key: string) => {
  try {
    // Check if import.meta exists and has env
    if (import.meta && (import.meta as any).env) {
      return (import.meta as any).env[key];
    }
    // Fallback for some process.env environments
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || "http://200.141.9.217:8000";
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing. App may not function correctly.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
