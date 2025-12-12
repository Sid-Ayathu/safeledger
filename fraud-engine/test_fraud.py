import unittest
import time
from collections import deque
# Import reset_state to clear global variables between tests
from main import RiskEngine, reset_state

class TestRiskEngine(unittest.TestCase):
    def setUp(self):
        # Initialize a fresh engine before every test
        reset_state() # <--- CRITICAL FIX: Clear global user_profiles
        self.engine = RiskEngine()
        # Mock a user profile
        self.user_id = "test_user_1"

    def test_normal_transaction(self):
        """Test a standard, safe transaction"""
        status, reason = self.engine.analyze(self.user_id, 50.0)
        self.assertEqual(status, "COMPLETED")
        self.assertEqual(reason, "Verified")

    def test_structuring_fraud(self):
        """Test detection of amounts just under $10k limit"""
        # 9900 is between 9500 and 10000 -> Should fail
        status, reason = self.engine.analyze(self.user_id, 9900.0)
        self.assertEqual(status, "REJECTED")
        self.assertIn("Structuring", reason)

    def test_velocity_fraud(self):
        """Test detection of too many transactions in short time"""
        # HFT Rule: > 5 tx in 10 seconds
        
        # 1. Simulate 6 fast transactions (All should pass/count towards limit)
        # Note: The logic allows 5 previous transactions. The 6th is processed.
        # So we need 6 in history to trigger failure on the 7th.
        for _ in range(6):
            self.engine.analyze(self.user_id, 10.0)
        
        # 2. The 7th one should fail (Count = 6 > Limit 5)
        status, reason = self.engine.analyze(self.user_id, 10.0)
        self.assertEqual(status, "REJECTED")
        self.assertIn("Velocity", reason)

    def test_statistical_anomaly(self):
        """Test 3-Sigma deviation rule"""
        # 1. Train the profile with small amounts
        # Limit to 5 items to avoid triggering the Velocity Rule (limit 5) during setup
        small_amounts = [10, 12, 10, 11, 10] 
        for amt in small_amounts:
            self.engine.analyze(self.user_id, amt)
            
        # 2. Try a huge jump (Massive outlier)
        status, reason = self.engine.analyze(self.user_id, 5000.0)
        
        self.assertEqual(status, "REJECTED")
        self.assertIn("Anomaly", reason)

if __name__ == '__main__':
    unittest.main()