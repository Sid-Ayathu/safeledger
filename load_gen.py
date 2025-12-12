import requests
import time
import sys
import random

# Gateway URL (Ensure port forwarding is on!)
URL = "http://localhost:3000"

def simulate_user(user_id):
    print(f"🚀 Starting active session for User {user_id}...")
    
    # 1. Login
    username = "user"
    password = "password123"
    try:
        resp = requests.post(f"{URL}/auth/login", json={"username": username, "password": password})
        if resp.status_code != 200:
            print(f"❌ Login Failed: {resp.status_code}")
            return
        token = resp.json()['token']
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Login successful. Starting activity loop...")
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    # 2. Activity Loop (Spamming requests to trigger CPU spike)
    count = 0
    while True:
        try:
            # Action A: Check Balance
            requests.get(f"{URL}/transaction/balance", headers=headers)
            
            # Action B: Transfer Money (Small amount)
            payload = {"amount": 1, "recipientId": 1}
            requests.post(f"{URL}/transaction/transfer", json=payload, headers=headers)
            
            count += 1
            if count % 10 == 0:
                print(f"⚡ Activity: {count} actions performed...")
            
            # Sleep slightly to not crash the PC, but fast enough to spike CPU
            time.sleep(0.1) 
            
        except KeyboardInterrupt:
            print("\n🛑 User logged out.")
            break
        except Exception as e:
            print(f"⚠️ Network blip: {e}")
            time.sleep(1)

if __name__ == "__main__":
    simulate_user(random.randint(1000, 9999))