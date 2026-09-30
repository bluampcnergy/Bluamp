import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

stdin, stdout, stderr = client.exec_command('grep -A 25 "studio:" /root/supabase/docker/docker-compose.yml')
print("Studio service in docker-compose.yml:")
print(stdout.read().decode('utf-8'))

client.close()

