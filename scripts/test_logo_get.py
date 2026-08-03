import urllib.request

url = "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})

try:
    with urllib.request.urlopen(req) as response:
        content_type = response.headers.get('Content-Type')
        content_length = response.headers.get('Content-Length')
        print(f"URL: {url}")
        print(f"Status: {response.status}")
        print(f"Content-Type: {content_type}")
        print(f"Content-Length: {content_length}")
except Exception as e:
    print(f"Error fetching URL: {e}")
