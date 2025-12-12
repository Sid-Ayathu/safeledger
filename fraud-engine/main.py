import pika
import json
import time
import requests
import os
import numpy as np
from collections import deque

# --- CONFIGURATION ---
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
QUEUE_NAME = 'transaction_events'
LEDGER_URL = os.getenv('LEDGER_URL', 'http://localhost:3002/transaction/update')

# --- IN-MEMORY STATE (Simulating a Redis Cache) ---
# In production HFT, this would be Redis Cluster
# Structure: { user_id: { 'history': deque([amounts]), 'timestamps': deque([times]) } }
user_profiles = {}

def reset_state():
    """Helper for testing: Clears all user profiles"""
    global user_profiles
    user_profiles = {}

# --- FRAUD RULES ENGINE ---

class RiskEngine:
    def __init__(self):
        # Configuration for HFT Rules
        self.VELOCITY_WINDOW = 10  # look at last 10 seconds
        self.VELOCITY_LIMIT = 5    # max 5 tx per 10 seconds
        self.STRUCTURING_LIMIT = 10000
        self.STRUCTURING_THRESHOLD = 0.95 # 95% of limit (e.g. 9500-9999)

    def get_profile(self, user_id):
        if user_id not in user_profiles:
            user_profiles[user_id] = {
                'amounts': deque(maxlen=50),      # Keep last 50 amounts
                'timestamps': deque(maxlen=50)    # Keep last 50 timestamps
            }
        return user_profiles[user_id]

    def check_velocity(self, timestamps):
        """HFT Rule: Detect Bot-like speed"""
        if len(timestamps) < 2:
            return False
        
        current_time = time.time()
        # Count transactions in the last VELOCITY_WINDOW seconds
        recent_tx_count = sum(1 for t in timestamps if (current_time - t) < self.VELOCITY_WINDOW)
        
        if recent_tx_count > self.VELOCITY_LIMIT:
            print(f" [!] HFT VELOCITY ALERT: {recent_tx_count} tx in {self.VELOCITY_WINDOW}s")
            return True
        return False

    def check_structuring(self, amount):
        """Compliance Rule: Detect 'Smurfing' (just under reporting limits)"""
        # If amount is between $9500 and $10000
        if (self.STRUCTURING_LIMIT * self.STRUCTURING_THRESHOLD) <= amount < self.STRUCTURING_LIMIT:
            print(f" [!] STRUCTURING ALERT: ${amount} is suspicious")
            return True
        return False

    def check_anomaly(self, amounts, current_amount):
        """Statistical Rule: Detect deviations from user's average"""
        if len(amounts) < 5:
            return False # Not enough history
        
        history = list(amounts)
        avg = np.mean(history)
        std_dev = np.std(history)
        
        # If transaction is > Average + 3 Standard Deviations (3-Sigma Rule)
        if std_dev > 0 and current_amount > (avg + (3 * std_dev)):
            print(f" [!] ANOMALY ALERT: ${current_amount} is > 3-Sigma from Avg ${avg:.2f}")
            return True
        return False

    def analyze(self, user_id, amount):
        profile = self.get_profile(user_id)
        current_time = time.time()
        
        # 1. Run Checks
        is_velocity_fraud = self.check_velocity(profile['timestamps'])
        is_structuring = self.check_structuring(amount)
        is_anomaly = self.check_anomaly(profile['amounts'], amount)
        
        # 2. Update Profile (Store current tx for next time)
        profile['timestamps'].append(current_time)
        profile['amounts'].append(amount)
        
        # 3. Decision Logic
        if is_velocity_fraud:
            return "REJECTED", "High Frequency Trading Velocity Exceeded"
        if is_structuring:
            return "REJECTED", "Potential Structuring Detected"
        if is_anomaly:
            return "REJECTED", "Statistical Anomaly Detected"
            
        return "COMPLETED", "Verified"

engine = RiskEngine()

# --- INFRASTRUCTURE ---

def connect_rabbitmq():
    while True:
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
            channel = connection.channel()
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            print(f"✅ Connected to RabbitMQ at {RABBITMQ_HOST}")
            return channel
        except Exception as e:
            print(f"❌ Connection to {RABBITMQ_HOST} failed: {e}. Retrying in 5s...")
            time.sleep(5)

def process_transaction(ch, method, properties, body):
    try:
        event = json.loads(body)
        tx_id = event.get('transactionId')
        user_id = event.get('senderId')
        amount = float(event.get('amount'))
        
        print(f" [>] Analyzing Tx {tx_id}: User {user_id} -> ${amount}...")
        
        # Artificial Processing Delay (Simulate complex computation)
        time.sleep(0.5) 

        # Run the Risk Engine
        status, reason = engine.analyze(user_id, amount)
        
        if status == "REJECTED":
            print(f" 🛑 BLOCKED: {reason}")
        else:
            print(f" ✅ VERIFIED")

        # Callback to Ledger
        payload = {"transactionId": str(tx_id), "status": status}
        try:
            requests.post(LEDGER_URL, json=payload, timeout=5)
        except Exception as api_err:
            print(f" ⚠️ Failed to update Ledger: {api_err}")

    except Exception as e:
        print(f" ❌ Error processing message: {e}")

    ch.basic_ack(delivery_tag=method.delivery_tag)

if __name__ == "__main__":
    print(" [*] Starting High-Frequency Fraud Detection Engine...")
    # Delay for sidecars to start up
    time.sleep(5)
    channel = connect_rabbitmq()
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=process_transaction)
    print(' [*] Engine Active. Waiting for stream...')
    channel.start_consuming()