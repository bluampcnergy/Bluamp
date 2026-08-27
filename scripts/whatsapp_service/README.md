# Datlion Cnergy - WhatsApp Invoice Ingestion VPS Service

This standalone service runs on your VPS to automatically receive invoices sent via WhatsApp, process them using Gemini AI OCR, and store them directly in your Supabase database and ledger.

## Quick Start on VPS

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env` or Environment Variables:**
   ```bash
   export PORT=3005
   export SUPABASE_URL="https://supabase.cnergy.co.in"
   export SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
   export WHATSAPP_VERIFY_TOKEN="CNERGY_WA_INVOICE_HOOK_2026"
   export WHATSAPP_ACCESS_TOKEN="your_permanent_meta_system_user_token"
   export WHATSAPP_PHONE_NUMBER_ID="your_phone_number_id"
   export GEMINI_API_KEY="your_gemini_api_key"
   export ALLOWED_WHATSAPP_NUMBERS="919876543210,919123456789"
   ```

3. **Start with PM2 (Daemon Mode):**
   ```bash
   pm2 start server.cjs --name "cnergy-whatsapp"
   pm2 save
   ```

4. **Nginx Reverse Proxy Config (Optional):**
   ```nginx
   location /api/webhooks/whatsapp {
       proxy_pass http://127.0.0.1:3005/api/webhooks/whatsapp;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```
