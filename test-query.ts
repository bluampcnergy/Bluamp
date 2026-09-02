import { createClient } from '@supabase/supabase-js';

const SUPABASE_VPS_URL = 'https://supabase.cnergy.co.in';
const SUPABASE_VPS_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(SUPABASE_VPS_URL, SUPABASE_VPS_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    headers: {
      'apikey': SUPABASE_VPS_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_VPS_SERVICE_KEY}`
    }
  }
});

async function run() {
  console.log('--- Fetching employee_tasks with explicit auth headers ---');
  const { data, error } = await supabase
    .from('employee_tasks')
    .select('*')
    .or('completed.is.null,completed.eq.false')
    .order('due_date', { ascending: true, nullsFirst: false });

  console.log('Result count:', data?.length, 'Error:', error);
}

run();
