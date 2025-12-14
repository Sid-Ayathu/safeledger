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

# --- FIX: Initialize Account by checking balance ---
print("🏦 Initializing Wallet...")
requests.get(f"{URL}/transaction/balance", headers=headers)
# --------------------------------------------------

# 2. Fire 10 transactions rapidly
print("🚀 Launching High-Frequency Attack...")
for i in range(1, 10):
    payload = {"amount": 10 + i, "recipientId": 1} # Sending to Admin (ID 1)
    
    try:
        r = requests.post(f"{URL}/transaction/transfer", json=payload, headers=headers)
        
        if r.status_code == 200:
            tx_id = r.json().get('transactionId')
            
            # Allow a tiny bit of time for RabbitMQ -> Python -> Ledger processing
            time.sleep(1.0) 
            
            # Check result
            status_resp = requests.get(f"{URL}/transaction/status/{tx_id}", headers=headers)
            status = status_resp.json().get('status')
            
            # Add color for dramatic effect
            if status == "REJECTED":
                print(f"Tx #{i}: 🛑 REJECTED (Fraud Detected)")
            elif status == "COMPLETED":
                print(f"Tx #{i}: ✅ COMPLETED")
            else:
                print(f"Tx #{i}: ⏳ {status}")
        else:
            print(f"Tx #{i}: ❌ Request Failed ({r.text})")
            
    except Exception as e:
        print(f"Tx #{i}: ⚠️ Error {e}")