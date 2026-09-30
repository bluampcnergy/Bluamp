import urllib.request
import base64

def test_auth(user, pwd):
    url = 'https://supabase.cnergy.co.in'
    req = urllib.request.Request(url)
    auth_str = f"{user}:{pwd}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    req.add_header('Authorization', f'Basic {b64_auth}')
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"User '{user}' -> Status: {resp.status} SUCCESS")
    except Exception as e:
        print(f"User '{user}' -> Result: {e}")

print("Testing old credentials (supabase):")
test_auth('supabase', 'this_password_is_insecure_and_should_be_updated')

print("\nTesting new credentials (datlioncnergy@gmail.com):")
test_auth('datlioncnergy@gmail.com', 'thisisbusiness')
