import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

cmd = 'grep -n -A 35 "storage:" /root/supabase/docker/docker-compose.yml'
stdin, stdout, stderr = client.exec_command(cmd)

print("Storage service configuration in docker-compose.yml:")
print(stdout.read().decode('utf-8'))

client.close()
