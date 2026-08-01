import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://200.141.9.217:8000';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseServiceKey) {
        return res.status(500).json({ error: 'Server misconfiguration: Service Role Key missing. Cannot auto-migrate users.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        // Attempt to create user with auto-confirm
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Force confirm email so they can log in immediately
        });

        if (error) {
            if (error.message.includes('already exists')) {
                // If it already exists, just return success so they can sign in normally
                return res.status(200).json({ success: true, message: 'User already exists' });
            }
            throw error;
        }

        return res.status(200).json({ success: true, user: data.user });
    } catch (err: any) {
        console.error('Migration error:', err);
        return res.status(500).json({ error: err.message });
    }
}
