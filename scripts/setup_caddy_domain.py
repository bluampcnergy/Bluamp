import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

caddyfile = """supabase.cnergy.co.in, vps.cnergy.co.in {
    reverse_proxy localhost:8000
}

http://supabase.cnergy.co.in, http://vps.cnergy.co.in, http://200.141.9.217 {
    reverse_proxy localhost:8000
}
"""

print("Updating Caddyfile on VPS for supabase.cnergy.co.in & vps.cnergy.co.in...")
cmd = f"echo '{caddyfile}' > /etc/caddy/Caddyfile && systemctl restart caddy"
stdin, stdout, stderr = client.exec_command(cmd)

out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
print("STDERR:", err)

# Check active status
stdin, stdout, stderr = client.exec_command('systemctl is-active caddy')
print("Caddy Status:", stdout.read().decode().strip())

client.close()
