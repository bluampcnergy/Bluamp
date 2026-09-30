import os
import paramiko
import uuid

# 1. Connect to Hostinger VPS
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

sftp = client.open_sftp()

# 2. Ensure remote folder exists
remote_images_dir = "/root/supabase/docker/volumes/storage/stub/Images"
try:
    sftp.mkdir(remote_images_dir)
    print("Created remote directory 'Images'")
except Exception as e:
    print(f"Notice: {e}")

# 3. Upload all files from C:\Users\indra\Downloads\Images
local_dir = r"C:\Users\indra\Downloads\Images"
files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]

for f in files:
    local_path = os.path.join(local_dir, f)
    remote_path = f"{remote_images_dir}/{f}"
    print(f"Uploading {f}...")
    sftp.put(local_path, remote_path)
    print(f"Uploaded {f} successfully")

sftp.close()

# 4. Insert/Upsert bucket metadata & file object metadata
insert_sql = """
INSERT INTO storage.buckets (id, name, owner, public, created_at, updated_at)
VALUES ('Images', 'Images', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET public = true;
"""

for f in files:
    new_id = str(uuid.uuid4())
    mimetype = "image/jpeg" if f.endswith(".jpg") or f.endswith(".jpeg") else "image/png"
    insert_sql += f"""
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
VALUES ('{new_id}', 'Images', '{f}', NULL, NOW(), NOW(), '{{\"mimetype\": \"{mimetype}\"}}')
ON CONFLICT (bucket_id, name) DO NOTHING;
"""

stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres')
stdin.write(insert_sql)
stdin.flush()
stdin.channel.shutdown_write()

print("DB Registration output:")
print(stdout.read().decode('utf-8'))

# Verify count in Images bucket
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT count(*) FROM storage.objects WHERE bucket_id = \'Images\';"')
print("Total registered images in Images bucket:", stdout.read().decode('utf-8'))

client.close()
print("\nALL FILES UPLOADED AND REGISTERED IN 'Images' BUCKET SUCCESSFULLY!")

