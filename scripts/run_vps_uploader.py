import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

py_script = """
import os
import urllib.request
import json

service_key = ""
with open('/root/supabase/docker/.env') as f:
    for line in f:
        if line.startswith('SERVICE_ROLE_KEY='):
            service_key = line.strip().split('=', 1)[1]

def upload(local_path, bucket, name):
    url = f"http://127.0.0.1:8000/storage/v1/object/{bucket}/{name}"
    with open(local_path, 'rb') as f:
        data = f.read()
    
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {service_key}')
    req.add_header('Content-Type', 'image/png' if name.endswith('.png') else 'image/jpeg')
    req.add_header('x-upsert', 'true')
    
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"OK {bucket}/{name} -> {resp.status} {resp.read().decode('utf-8')}")
    except Exception as e:
        print(f"ERR {bucket}/{name} -> {e}")

# Upload Logo files
logo_dir = '/tmp/clean_upload_Logo'
if os.path.exists(logo_dir):
    for f in os.listdir(logo_dir):
        path = os.path.join(logo_dir, f)
        if os.path.isfile(path):
            upload(path, 'Logo', f)

# Upload products files
prod_dir = '/tmp/clean_upload_Logo'
# products folder
for f in os.listdir(logo_dir):
    if f == 'products' or os.path.isdir(os.path.join(logo_dir, f)):
        for pf in os.listdir(os.path.join(logo_dir, 'products')):
            upload(os.path.join(logo_dir, 'products', pf), 'Logo', f'products/{pf}')

# Upload Images files
img_dir = '/tmp/clean_upload_Images'
if os.path.exists(img_dir):
    for f in os.listdir(img_dir):
        path = os.path.join(img_dir, f)
        if os.path.isfile(path):
            upload(path, 'Images', f)
"""

client.exec_command("echo '''" + py_script + "''' > /tmp/vps_uploader.py")
stdin, stdout, stderr = client.exec_command('python3 /tmp/vps_uploader.py')
print("VPS Uploader output:")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
