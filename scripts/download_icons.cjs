const fs = require('fs');
const path = require('path');

async function downloadLogo() {
  const url = 'https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png';
  console.log('Fetching logo from:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log('Logo downloaded, size in bytes:', buffer.length);

    const targetPaths = [
      path.join(__dirname, '..', 'public', 'icon-192.png'),
      path.join(__dirname, '..', 'public', 'icon-512.png'),
      path.join(__dirname, '..', 'public', 'apple-touch-icon.png'),
      path.join(__dirname, '..', 'public', 'favicon.png'),
      path.join(__dirname, '..', 'icon-192.png'),
      path.join(__dirname, '..', 'icon-512.png')
    ];

    for (const p of targetPaths) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buffer);
      console.log('Wrote:', p);
    }
    console.log('All icons successfully written!');
  } catch (err) {
    console.error('Failed to download logo:', err.message);
  }
}

downloadLogo();
