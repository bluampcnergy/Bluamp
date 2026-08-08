import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

cmd = 'grep -E "ANON_KEY=|SERVICE_ROLE_KEY=" /root/supabase/docker/.env'
stdin, stdout, stderr = client.exec_command(cmd)

print("Actual keys in VPS /root/supabase/docker/.env:")
print(stdout.read().decode('utf-8'))

client.close()
