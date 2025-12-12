import pika
import json
import time
import requests
import os

# Config: Read from Env Variable, default to localhost (for local testing)
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
QUEUE_NAME = 'transaction_events'
LEDGER_URL = os.getenv('LEDGER_URL', 'http://localhost:3002/transaction/update')

print(f"[*] Configuration: Connecting to RabbitMQ at {RABBITMQ_HOST}...")

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
    event = json.loads(body)
    tx_id = event.get('transactionId')
    amount = event.get('amount')
    
    print(f" [x] Processing Transaction {tx_id} for ${amount}...")
    
    # Simulate processing
    time.sleep(2)

    new_status = "COMPLETED"
    if amount > 900:
        new_status = "REJECTED"
        print(" ⚠️  FRAUD DETECTED: Amount too high!")
    else:
        print(" ✅ Transaction Verified.")

    try:
        payload = {"transactionId": str(tx_id), "status": new_status}
        response = requests.post(LEDGER_URL, json=payload)
        if response.status_code == 200:
            print(f" 🔄 Ledger updated: {new_status}")
        else:
            print(f" ❌ Failed to update Ledger: {response.text}")
    except Exception as e:
        print(f" ❌ API Error: {e}")

    ch.basic_ack(delivery_tag=method.delivery_tag)

if __name__ == "__main__":
    # Force a delay to let RabbitMQ start up fully in K8s
    time.sleep(5)
    channel = connect_rabbitmq()
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=process_transaction)
    print(' [*] Fraud Engine Running. Press CTRL+C to exit')
    channel.start_consuming()