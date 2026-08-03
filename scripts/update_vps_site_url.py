import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

print("Updating SITE_URL in VPS Supabase .env file...")
stdin, stdout, stderr = client.exec_command("sed -i 's|SITE_URL=.*|SITE_URL=https://inventory.cnergy.co.in|g' /root/supabase/docker/.env")
print("Exit status:", stdout.channel.recv_exit_status())

stdin, stdout, stderr = client.exec_command("sed -i 's|ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://inventory.cnergy.co.in|g' /root/supabase/docker/.env")
print("Exit status:", stdout.channel.recv_exit_status())

print("Restarting Supabase stack to apply site URL...")
stdin, stdout, stderr = client.exec_command("cd /root/supabase/docker && docker compose restart")
print("Docker restart status:", stdout.channel.recv_exit_status())

client.close()
print("Supabase auth site URL updated successfully for inventory.cnergy.co.in!")
