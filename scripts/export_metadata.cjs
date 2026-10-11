const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'supabase.cnergy.co.in';

async function fetchMetadata() {
  const exportDir = path.join(__dirname, '..', 'supabase', 'metadata');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    { name: 'project_details.json', url: `https://api.supabase.com/v1/projects/${PROJECT_REF}` },
    { name: 'functions.json', url: `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions` },
    { name: 'buckets.json', url: `https://api.supabase.com/v1/projects/${PROJECT_REF}/types/typescript` },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Fetching ${ep.name}...`);
      const res = await fetch(ep.url, { headers });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(path.join(exportDir, ep.name), text);
        console.log(`Saved ${ep.name}`);
      } else {
        console.warn(`Failed ${ep.name}: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error(`Error fetching ${ep.name}:`, err.message);
    }
  }

  console.log("Metadata export complete!");
}

fetchMetadata();
