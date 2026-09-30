import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("Updating Studio environment variables in docker-compose.yml...")
cmd = """
sed -i 's|SUPABASE_URL: http://kong:8000|SUPABASE_URL: ${SUPABASE_PUBLIC_URL}\\n      NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_PUBLIC_URL}|g' /root/supabase/docker/docker-compose.yml
"""
stdin, stdout, stderr = client.exec_command(cmd)
print("Exit status:", stdout.channel.recv_exit_status())

print("Restarting Studio container...")
stdin, stdout, stderr = client.exec_command("cd /root/supabase/docker && docker compose up -d --force-recreate studio")
print("Recreate Studio exit status:", stdout.channel.recv_exit_status())

client.close()
print("Studio environment updated!")

