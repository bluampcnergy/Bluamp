import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("Updating STORAGE_PUBLIC_URL in VPS .env...")
# Check if STORAGE_PUBLIC_URL already exists in .env
stdin, stdout, stderr = client.exec_command('grep -i "STORAGE_PUBLIC_URL" /root/supabase/docker/.env')
res = stdout.read().decode('utf-8')

if "STORAGE_PUBLIC_URL" in res:
    cmd = "sed -i 's|STORAGE_PUBLIC_URL=.*|STORAGE_PUBLIC_URL=https://supabase.cnergy.co.in/storage/v1|g' /root/supabase/docker/.env"
else:
    cmd = "echo 'STORAGE_PUBLIC_URL=https://supabase.cnergy.co.in/storage/v1' >> /root/supabase/docker/.env"

stdin, stdout, stderr = client.exec_command(cmd)
print("Exit status:", stdout.channel.recv_exit_status())

print("Restarting storage and studio containers...")
stdin, stdout, stderr = client.exec_command("cd /root/supabase/docker && docker compose restart storage studio")
print("Docker restart status:", stdout.channel.recv_exit_status())

client.close()
print("Storage URL updated successfully!")

