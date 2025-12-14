import requests
import time

URL = "http://localhost:3000"

# 1. Login to get a token
print("🤖 Bot Logging in...")
resp = requests.post(f"{URL}/auth/login", json={"username": "bot_user", "password": "password123"})

# (If user doesn't exist, register quickly)
if resp.status_code != 200:
    requests.post(f"{URL}/auth/register", json={"username": "bot_user", "password": "password123"})
    resp = requests.post(f"{URL}/auth/login", json={"username": "bot_user", "password": "password123"})

token = resp.json()['token']
headers = {"Authorization": f"Bearer {token}"}

# 2. Fire 10 transactions rapidly
print("🚀 Launching High-Frequency Attack...")
for i in range(1, 10):
    payload = {"amount": 10 + i, "recipientId": 1}
    r = requests.post(f"{URL}/transaction/transfer", json=payload, headers=headers)
    
    # Check status immediately
    tx_id = r.json().get('transactionId')
    time.sleep(0.2) # Small delay to allow processing
    
    # Check result
    status_resp = requests.get(f"{URL}/transaction/status/{tx_id}", headers=headers)
    status = status_resp.json().get('status')
    print(f"Tx #{i}: {status}")