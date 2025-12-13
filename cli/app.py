import requests
import time
import os
import sys
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, IntPrompt
from rich.table import Table
from rich.status import Status

console = Console()

# Configuration
# Ensure you have forwarded the port: kubectl port-forward svc/api-gateway 3000:3000
GATEWAY_URL = "http://localhost:3000"

# Session State
current_token = None
current_user_id = None
current_username = None

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    clear_screen()
    console.print(Panel.fit("[bold blue]🏦 SafeLedger Banking CLI[/bold blue]", subtitle="Secure. Distributed. Fast."))

def register():
    print_header()
    console.print("[yellow]📝 Create New Account[/yellow]")
    username = Prompt.ask("Choose a username")
    password = Prompt.ask("Choose a password", password=True)
    
    try:
        resp = requests.post(f"{GATEWAY_URL}/auth/register", json={"username": username, "password": password})
        if resp.status_code == 200:
            console.print(f"[green]✅ Account created for {username}! You can now login.[/green]")
        else:
            # FIX: Robust error handling for non-JSON responses (e.g., 502 Bad Gateway)
            try:
                error_msg = resp.json().get('message')
            except ValueError:
                error_msg = f"Server Error ({resp.status_code}): {resp.text[:200]}" # Print first 200 chars
            console.print(f"[red]❌ Error: {error_msg}[/red]")
    except Exception as e:
        console.print(f"[red]❌ Connection Error: {e}[/red]")
        console.print("[yellow]💡 Hint: Check if 'kubectl port-forward' is running and the Gateway pod is healthy.[/yellow]")
    
    Prompt.ask("\nPress Enter to return...")

def login():
    global current_token, current_user_id, current_username
    print_header()
    console.print("[yellow]🔐 Login[/yellow]")
    username = Prompt.ask("Username")
    password = Prompt.ask("Password", password=True)
    
    try:
        resp = requests.post(f"{GATEWAY_URL}/auth/login", json={"username": username, "password": password})
        if resp.status_code == 200:
            data = resp.json()
            current_token = data['token']
            # Note: Auth service needs to return 'id' in the login response for this to work
            # If your auth service doesn't return ID, we default to 0 (which might cause issues with balance checks)
            current_user_id = data.get('id', 0) 
            current_username = username
            console.print("[green]✅ Login Successful![/green]")
            time.sleep(1)
            main_menu()
        else:
            try:
                # Try to get specific error message if possible
                error_text = resp.json().get('message', 'Invalid Credentials')
            except ValueError:
                error_text = f"Invalid Credentials (Status: {resp.status_code})"
                
            console.print(f"[red]❌ {error_text}[/red]")
            time.sleep(2)
    except Exception as e:
        console.print(f"[red]❌ Connection Error to Gateway ({GATEWAY_URL}).[/red]")
        console.print(f"[red]Details: {e}[/red]")
        console.print("[yellow]💡 Hint: Ensure 'kubectl port-forward svc/api-gateway 3000:3000' is running.[/yellow]")
        Prompt.ask("Press Enter...")

def get_balance():
    headers = {"Authorization": f"Bearer {current_token}"}
    try:
        resp = requests.get(f"{GATEWAY_URL}/transaction/balance", headers=headers)
        if resp.status_code == 200:
            return resp.json()['balance']
        else:
            return 0
    except:
        return 0

def transfer_money():
    print_header()
    balance = get_balance()
    console.print(f"💰 Current Balance: [bold green]${balance}[/bold green]")
    console.print("[yellow]💸 Transfer Money[/yellow]")
    
    recipient = IntPrompt.ask("Recipient ID (e.g., 1 for Admin)")
    amount = IntPrompt.ask("Amount to transfer")
    
    if amount > balance:
        console.print("[red]❌ Insufficient Funds![/red]")
        time.sleep(2)
        return

    headers = {"Authorization": f"Bearer {current_token}"}
    payload = {"recipientId": recipient, "amount": amount}
    
    # Show a spinner while the request is being sent
    with console.status("[bold green]Processing transaction request...[/bold green]"):
        try:
            resp = requests.post(f"{GATEWAY_URL}/transaction/transfer", json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                tx_id = data['transactionId']
                console.print(f"[green]✅ Request Sent! TxID: {tx_id}[/green]")
                track_transaction(tx_id)
            else:
                try:
                    err = resp.json().get('message', resp.text)
                except:
                    err = f"Status {resp.status_code}"
                console.print(f"[red]❌ Error: {err}[/red]")
        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")
            console.print("[yellow]💡 Hint: Connection lost. Check Port Forwarding.[/yellow]")
    
    Prompt.ask("\nPress Enter to continue...")

def track_transaction(tx_id):
    console.print("🕵️  Tracking status on Ledger...")
    headers = {"Authorization": f"Bearer {current_token}"}
    
    # Poll for status update (waiting for RabbitMQ + Python Fraud Engine)
    for _ in range(10): # Poll for 10 seconds max
        try:
            resp = requests.get(f"{GATEWAY_URL}/transaction/status/{tx_id}", headers=headers)
            if resp.status_code == 200:
                status = resp.json()['status']
                if status == "COMPLETED":
                    console.print(f"\n[bold green]✅ Transaction COMPLETED![/bold green]")
                    return
                elif status == "REJECTED":
                    console.print(f"\n[bold red]⛔ Transaction REJECTED (Possible Fraud)[/bold red]")
                    return
                else:
                    console.print(f"[blue]⏳ Status: {status}...[/blue]", end="\r")
        except:
            pass
        time.sleep(1)
    
    console.print("\n[yellow]⚠️ Transaction is taking longer than usual.[/yellow]")

def main_menu():
    while True:
        print_header()
        console.print(f"👤 User: [bold cyan]{current_username}[/bold cyan] (ID: {current_user_id})")
        
        # Fetch live balance
        balance = get_balance()
        console.print(Panel(f"[bold green]${balance}[/bold green]", title="Wallet Balance", expand=False))
        
        console.print("\n[1] 💸 Transfer Money")
        console.print("[2] 🔄 Refresh Balance")
        console.print("[3] 🚪 Logout")
        
        choice = IntPrompt.ask("Select Option", choices=["1", "2", "3"])
        
        if choice == 1:
            transfer_money()
        elif choice == 2:
            continue
        elif choice == 3:
            return

def start():
    while True:
        print_header()
        console.print("[1] 🔐 Login")
        console.print("[2] 📝 Register")
        console.print("[3] ❌ Exit")
        
        choice = IntPrompt.ask("Select Option", choices=["1", "2", "3"])
        
        if choice == 1:
            login()
        elif choice == 2:
            register()
        elif choice == 3:
            console.print("Goodbye! 👋")
            sys.exit()

if __name__ == "__main__":
    start()