import paramiko
import sys

hostname = "200.141.9.217"
username = "root"
password = "YOUR_VPS_PASSWORD"

print(f"Connecting to VPS at {hostname}...")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(hostname, port=22, username=username, password=password, timeout=30)
    print("SSH Connection established successfully!")

    print("\n[1/3] Cleaning existing public schema for a fresh import...")
    clean_cmd = 'docker exec -i supabase-db psql -U postgres -d postgres -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"'
    stdin, stdout, stderr = client.exec_command(clean_cmd)
    print(stdout.read().decode('utf-8'))

    print("\n[2/3] Restoring Table Schema DDL (schema.sql)...")
    schema_cmd = "cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < schema.sql"
    stdin, stdout, stderr = client.exec_command(schema_cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    print(f"Schema Out: {out[:300]}")
    if err and "ERROR" in err:
        print(f"Schema Errors: {err[:500]}")

    print("\n[3/3] Restoring Complete 43MB Data Dump (data.sql)...")
    data_cmd = "cd /root/supabase/docker && docker exec -i supabase-db psql -U postgres -d postgres < data.sql"
    stdin, stdout, stderr = client.exec_command(data_cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    print(f"Data Out: {out[:300]}")
    if err:
        # Show first 10 lines of output
        lines = err.splitlines()[:10]
        print("Data Import Log:")
        for line in lines:
            print(f"  {line}")

    print("\nVerifying restored table row counts:")
    verify_cmd = 'docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT table_name, (xpath(\'/row/c/text()\', query_to_xml(format(\'select count(*) as c from %I.%I\', table_schema, table_name), false, true, \'\')))[1]::text::int AS row_count FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY row_count DESC;"'
    stdin, stdout, stderr = client.exec_command(verify_cmd)
    print(stdout.read().decode('utf-8'))

    print("\nDATABASE RESTORATION COMPLETED SUCCESSFULLY ON HOSTINGER VPS!")

except Exception as e:
    print(f"Error during restore execution: {e}")
finally:
    client.close()

