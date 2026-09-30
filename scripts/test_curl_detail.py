import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

stdin, stdout, stderr = client.exec_command('grep "SERVICE_ROLE_KEY=" /root/supabase/docker/.env | cut -d= -f2')
service_key = stdout.read().decode('utf-8').strip()

cmd = f"""
curl -i -X POST "http://localhost:8000/storage/v1/object/Logo/DC_Energy.png" \\
  -H "Authorization: Bearer {service_key}" \\
  -H "Content-Type: image/png" \\
  -H "x-upsert: true" \\
  --data-binary "@'/tmp/clean_upload_Logo/DC_Energy.png'"
"""

stdin, stdout, stderr = client.exec_command(cmd)
print("Curl response detail:")
print(stdout.read().decode('utf-8'))

client.close()

