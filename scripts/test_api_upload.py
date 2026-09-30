import urllib.request
import os

service_role_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0dWIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3NDkyOTc0ODcsImV4cCI6MjA2NDg3MzQ4N30.2gK3fCkyGzM2Rk0Zp7G4M7A0wB3Rk3fCkyGzM2Rk0Zp7"
# Read service key from vps.env or script
with open('scripts/upload_logo_bucket.py') as f:
    code = f.read()

import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')
stdin, stdout, stderr = client.exec_command('grep "SERVICE_ROLE_KEY=" /root/supabase/docker/.env | cut -d= -f2')
service_key = stdout.read().decode('utf-8').strip()

print(f"Using Service Key: {service_key[:10]}...")

# Read local logo file C:\Users\indra\Downloads\Logo\DC_Full_battery_black_bg.png
local_file = r"C:\Users\indra\Downloads\Logo\DC_Full_battery_black_bg.png"
with open(local_file, 'rb') as f:
    file_data = f.read()

url = "https://supabase.cnergy.co.in/storage/v1/object/Logo/DC_Full_battery_black_bg.png"
req = urllib.request.Request(url, data=file_data, method='POST')
req.add_header('Authorization', f'Bearer {service_key}')
req.add_header('Content-Type', 'image/png')
req.add_header('x-upsert', 'true')

try:
    with urllib.request.urlopen(req) as resp:
        print("Upload status:", resp.status)
        print("Upload response:", resp.read().decode('utf-8'))
except Exception as e:
    print("Upload error:", e)

# Test GET request
get_url = "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png"
get_req = urllib.request.Request(get_url)
try:
    with urllib.request.urlopen(get_req) as resp:
        print("GET status:", resp.status)
        print("GET content type:", resp.headers.get('Content-Type'))
        print("GET content length:", resp.headers.get('Content-Length'))
except Exception as e:
    print("GET error:", e)

client.close()

