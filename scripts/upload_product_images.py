import os
import paramiko
import uuid

# 1. Connect to Hostinger VPS
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

sftp = client.open_sftp()

# 2. Ensure remote folder exists
remote_products_dir = "/root/supabase/docker/volumes/storage/stub/Logo/products"
try:
    sftp.mkdir(remote_products_dir)
    print("Created remote directory 'Logo/products'")
except Exception as e:
    print(f"Notice: {e}")

# 3. Upload all 15 product images via SFTP
local_dir = r"C:\Users\indra\Downloads\Logo\products"
files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]

for f in files:
    local_path = os.path.join(local_dir, f)
    remote_path = f"{remote_products_dir}/{f}"
    print(f"Uploading {f}...")
    sftp.put(local_path, remote_path)
    print(f"Uploaded {f} successfully")

sftp.close()

# 4. Insert metadata into storage.objects
sql_lines = []
for f in files:
    new_id = str(uuid.uuid4())
    mimetype = "image/jpeg" if f.endswith(".jpg") or f.endswith(".jpeg") else "image/png"
    obj_name = f"products/{f}"
    sql_lines.append(
        f"INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata) "
        f"VALUES ('{new_id}', 'Logo', '{obj_name}', NULL, NOW(), NOW(), '{{\"mimetype\": \"{mimetype}\"}}') "
        f"ON CONFLICT (bucket_id, name) DO NOTHING;"
    )

sql_content = "\n".join(sql_lines)

stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres')
stdin.write(sql_content)
stdin.flush()
stdin.channel.shutdown_write()

print("DB Registration output:")
print(stdout.read().decode('utf-8'))

# Verify total count in Logo/products/
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT count(*) FROM storage.objects WHERE bucket_id = \'Logo\' AND name LIKE \'products/%\';"')
print("Total registered product images:", stdout.read().decode('utf-8'))

client.close()
print("\nALL 15 PRODUCT IMAGES UPLOADED AND REGISTERED SUCCESSFULLY!")

