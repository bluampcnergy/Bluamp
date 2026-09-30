import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

stdin, stdout, stderr = client.exec_command('grep -i -E "SUPABASE_PUBLIC_URL|API_EXTERNAL_URL|STORAGE_PUBLIC_URL" /root/supabase/docker/.env')
print("Current URL variables in .env:")
print(stdout.read().decode('utf-8'))

client.close()

