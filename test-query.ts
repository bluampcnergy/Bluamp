import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
async function test() {
    const term = 'INV';
    const {data, error} = await supabase
        .from('invoices')
        .select('*')
        .or(`invoice_metadata->>invoice_number.ilike.%${term}%,receiver_details->>name.ilike.%${term}%,issuer_details->>name.ilike.%${term}%`)
        .order('created_at', { ascending: false })
        .limit(10);
    console.log('Data count:', data?.length);
    if (error) console.error('Error:', error);
}
test();
