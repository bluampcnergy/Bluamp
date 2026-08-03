import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

stdin, stdout, stderr = client.exec_command('grep "SERVICE_ROLE_KEY=" /root/supabase/docker/.env | cut -d= -f2')
service_key = stdout.read().decode('utf-8').strip()

cmd = f"""
docker exec -i supabase-storage curl -i -X POST "http://localhost:5000/object/Logo/DC_Energy.png" \\
  -H "Authorization: Bearer {service_key}" \\
  -H "Content-Type: image/png" \\
  -H "x-upsert: true"
"""

stdin, stdout, stderr = client.exec_command(cmd)
print("Direct Storage container upload response:")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
