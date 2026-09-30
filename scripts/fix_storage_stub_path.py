import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("Fixing double stub path on VPS storage volume...")

# Ensure /root/supabase/docker/volumes/storage/stub/stub directory exists
stdin, stdout, stderr = client.exec_command('mkdir -p /root/supabase/docker/volumes/storage/stub/stub')

# Copy or sync all bucket folders (Logo, Images, Product drawings, etc.) into /root/supabase/docker/volumes/storage/stub/stub/
cmd = """
cd /root/supabase/docker/volumes/storage/stub && \
for dir in Logo Images "Product drawings"; do
    if [ -d "$dir" ]; then
        cp -r "$dir" /root/supabase/docker/volumes/storage/stub/stub/
    fi
done
"""
stdin, stdout, stderr = client.exec_command(cmd)
print("Exit status:", stdout.channel.recv_exit_status())

# Check contents of /root/supabase/docker/volumes/storage/stub/stub/Logo
stdin, stdout, stderr = client.exec_command('ls -la /root/supabase/docker/volumes/storage/stub/stub/Logo')
print("Contents of /stub/stub/Logo:")
print(stdout.read().decode('utf-8'))

client.close()
print("Storage path fix completed!")

