import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

cmd = 'docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT id, name, public FROM storage.buckets;"'
stdin, stdout, stderr = client.exec_command(cmd)

print("Buckets in database:")
print(stdout.read().decode('utf-8'))

cmd = 'docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT bucket_id, name FROM storage.objects WHERE name LIKE \'%DC_Full_battery_black_bg%\' OR bucket_id ILIKE \'logo\';"'
stdin, stdout, stderr = client.exec_command(cmd)

print("Objects matching logo:")
print(stdout.read().decode('utf-8'))

client.close()
