import { createClient } from '@supabase/supabase-js';

// Ultra-safe environment variable access
const getEnv = (key: string): string | undefined => {
  try {
    // Check Vite import.meta.env
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return val;
    }
    // Fallback for Node / process.env environments
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return val;
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
};

const DEFAULT_SUPABASE_URL = "https://ofnwuifgzqjmmnsqsoed.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbnd1aWZnenFqbW1uc3Fzb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQwODQsImV4cCI6MjEwMDM4MDA4NH0.J-EU8aFvlj1o6sMoWWJUJKbp8buMo4V8AbAmT7KkTz8";

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_KEY') || DEFAULT_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
