import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

sftp = client.open_sftp()

print("1. Truncating storage.objects table in database...")
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "TRUNCATE storage.objects CASCADE;"')
print(stdout.read().decode('utf-8'))

print("2. Clearing /root/supabase/docker/volumes/storage contents...")
stdin, stdout, stderr = client.exec_command('rm -rf /root/supabase/docker/volumes/storage/*')
print("Exit status:", stdout.channel.recv_exit_status())

print("3. Restarting supabase-storage container to ensure clean state...")
stdin, stdout, stderr = client.exec_command('cd /root/supabase/docker && docker compose up -d --force-recreate storage')
print("Recreate storage exit status:", stdout.channel.recv_exit_status())

# Get Service Role Key
stdin, stdout, stderr = client.exec_command('grep "SERVICE_ROLE_KEY=" /root/supabase/docker/.env | cut -d= -f2')
service_key = stdout.read().decode('utf-8').strip()

# Function to upload local folder files via Supabase Storage API
def upload_folder_api(local_dir, bucket_name, prefix=""):
    print(f"\n--- API Uploading '{local_dir}' -> Bucket: '{bucket_name}', Prefix: '{prefix}' ---")
    files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]
    
    vps_temp_dir = f"/tmp/clean_upload_{bucket_name}"
    client.exec_command(f"mkdir -p '{vps_temp_dir}'")
    
    for f in files:
        local_path = os.path.join(local_dir, f)
        vps_temp_path = f"{vps_temp_dir}/{f}"
        sftp.put(local_path, vps_temp_path)
        
        object_path = f"{prefix}/{f}" if prefix else f
        mimetype = "image/jpeg" if f.endswith((".jpg", ".jpeg")) else "image/png"
        
        curl_cmd = f"""
        curl -s -X POST "http://localhost:8000/storage/v1/object/{bucket_name}/{object_path}" \\
          -H "Authorization: Bearer {service_key}" \\
          -H "Content-Type: {mimetype}" \\
          -H "x-upsert: true" \\
          --data-binary "@'{vps_temp_path}'"
        """
        stdin, stdout, stderr = client.exec_command(curl_cmd)
        res = stdout.read().decode('utf-8')
        print(f"Uploaded '{object_path}' -> Response: {res.strip()}")

# Ensure buckets exist in DB
ensure_buckets_sql = """
INSERT INTO storage.buckets (id, name, owner, public, created_at, updated_at)
VALUES 
  ('Logo', 'Logo', NULL, true, NOW(), NOW()),
  ('Images', 'Images', NULL, true, NOW(), NOW()),
  ('Product drawings', 'Product drawings', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET public = true;
"""
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres')
stdin.write(ensure_buckets_sql)
stdin.flush()
stdin.channel.shutdown_write()
stdout.read()

# 4. Upload all files through clean API
upload_folder_api(r"C:\Users\indra\Downloads\Logo", "Logo")
upload_folder_api(r"C:\Users\indra\Downloads\Logo\products", "Logo", prefix="products")
upload_folder_api(r"C:\Users\indra\Downloads\Images", "Images")

sftp.close()
client.close()
print("\nCLEAN RE-UPLOAD COMPLETED!")

