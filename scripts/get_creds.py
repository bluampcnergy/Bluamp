import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

stdin, stdout, stderr = client.exec_command('cat /root/supabase/docker/.env')
content = stdout.read().decode('utf-8')

keys = ['POSTGRES_PASSWORD', 'DASHBOARD_USERNAME', 'DASHBOARD_PASSWORD', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET']
for line in content.splitlines():
    for key in keys:
        if line.startswith(f"{key}="):
            print(line)

client.close()
