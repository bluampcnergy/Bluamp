import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

stdin, stdout, stderr = client.exec_command('sed -n "/studio:/,/ports:/p" /root/supabase/docker/docker-compose.yml')
print("Studio environment variables:")
print(stdout.read().decode('utf-8'))

client.close()

