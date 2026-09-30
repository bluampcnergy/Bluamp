const { execSync } = require('child_process');

const ip = '200.141.9.217';
const pass = 'YOUR_VPS_PASSWORD';

console.log('Connecting to VPS and restoring database...');

const commands = [
  'cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < schema.sql',
  'cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < storage_schema.sql',
  'cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < auth_schema.sql',
  'cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < data.sql'
];

for (const cmd of commands) {
  console.log(`Running: ${cmd}`);
  const psScript = `$pass = ConvertTo-SecureString "${pass}" -AsPlainText -Force; $cred = New-Object System.Management.Automation.PSCredential ("root", $pass); sshpass -p "${pass}" ssh -o StrictHostKeyChecking=no root@${ip} "${cmd}"`;
}

