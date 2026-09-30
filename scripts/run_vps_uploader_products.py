import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

sftp = client.open_sftp()

script_content = """import os
import urllib.request
import urllib.parse

service_key = ""
with open('/root/supabase/docker/.env') as f:
    for line in f:
        if line.startswith('SERVICE_ROLE_KEY='):
            service_key = line.strip().split('=', 1)[1]

def upload(local_path, bucket, name):
    quoted_name = urllib.parse.quote(name)
    url = f"http://127.0.0.1:8000/storage/v1/object/{bucket}/{quoted_name}"
    with open(local_path, 'rb') as f:
        data = f.read()
    
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {service_key}')
    req.add_header('Content-Type', 'image/png' if name.endswith('.png') else 'image/jpeg')
    req.add_header('x-upsert', 'true')
    
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"OK {bucket}/{name} -> {resp.status}")
    except Exception as e:
        print(f"ERR {bucket}/{name} -> {e}")

# Upload products into products/ subfolder of Logo bucket
prod_dir = '/tmp/clean_upload_Logo/products'
if os.path.exists(prod_dir):
    for f in os.listdir(prod_dir):
        path = os.path.join(prod_dir, f)
        if os.path.isfile(path):
            upload(path, 'Logo', f'products/{f}')
"""

with sftp.file('/tmp/vps_uploader_products.py', 'w') as remote_file:
    remote_file.write(script_content)

stdin, stdout, stderr = client.exec_command('python3 /tmp/vps_uploader_products.py')
print("Products Subfolder Uploader output:")
print(stdout.read().decode('utf-8'))

sftp.close()
client.close()

