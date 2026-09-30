import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("Updating API_EXTERNAL_URL & SUPABASE_PUBLIC_URL in VPS .env...")
stdin, stdout, stderr = client.exec_command("sed -i 's|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://supabase.cnergy.co.in|g' /root/supabase/docker/.env")
print("Exit status 1:", stdout.channel.recv_exit_status())

stdin, stdout, stderr = client.exec_command("sed -i 's|SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://supabase.cnergy.co.in|g' /root/supabase/docker/.env")
print("Exit status 2:", stdout.channel.recv_exit_status())

print("Restarting Supabase stack...")
stdin, stdout, stderr = client.exec_command("cd /root/supabase/docker && docker compose restart")
print("Docker restart status:", stdout.channel.recv_exit_status())

client.close()
print("Supabase external URL updated!")

