import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("--- Caddyfile ---")
stdin, stdout, stderr = client.exec_command("cat /etc/caddy/Caddyfile")
print(stdout.read().decode('utf-8'))

print("--- Docker Containers ---")
stdin, stdout, stderr = client.exec_command("docker ps --format 'table {{.Names}}\t{{.Ports}}'")
print(stdout.read().decode('utf-8'))

print("--- Searching for Studio / Auth credentials in docker-compose & env ---")
stdin, stdout, stderr = client.exec_command("grep -i -E 'DASHBOARD|STUDIO|BASIC' /root/supabase/docker/.env /root/supabase/docker/docker-compose.yml")
print(stdout.read().decode('utf-8'))

client.close()

