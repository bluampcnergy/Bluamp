import paramiko
import re

print("Connecting to VPS...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

env_path = '/root/supabase/docker/.env'
stdin, stdout, stderr = client.exec_command(f'cat {env_path}')
content = stdout.read().decode('utf-8')

# Update DASHBOARD_USERNAME and DASHBOARD_PASSWORD in .env
new_content = re.sub(r'DASHBOARD_USERNAME=.*', 'DASHBOARD_USERNAME=datlioncnergy@gmail.com', content)
new_content = re.sub(r'DASHBOARD_PASSWORD=.*', 'DASHBOARD_PASSWORD=thisisbusiness', new_content)

# Write back to .env
sftp = client.open_sftp()
with sftp.file(env_path, 'w') as f:
    f.write(new_content)
sftp.close()
print("Updated /root/supabase/docker/.env on VPS successfully!")

# Restart kong and studio containers to apply new credentials
print("Restarting supabase-kong service to apply new credentials...")
stdin, stdout, stderr = client.exec_command('cd /root/supabase/docker && docker compose up -d kong studio')
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
print("VPS credential update completed successfully.")

