import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

stdin, stdout, stderr = client.exec_command('docker logs --tail 50 supabase-storage')
print("Logs from supabase-storage:")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
