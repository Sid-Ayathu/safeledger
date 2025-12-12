import unittest
import time
from collections import deque
from main import RiskEngine

class TestRiskEngine(unittest.TestCase):
    def setUp(self):
        # Initialize a fresh engine before every test
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
        
        # 1. Simulate 5 fast transactions (Should pass)
        for _ in range(5):
            self.engine.analyze(self.user_id, 10.0)
        
        # 2. The 6th one should fail
        status, reason = self.engine.analyze(self.user_id, 10.0)
        self.assertEqual(status, "REJECTED")
        self.assertIn("Velocity", reason)

    def test_statistical_anomaly(self):
        """Test 3-Sigma deviation rule"""
        # 1. Train the profile with small amounts
        small_amounts = [10, 12, 10, 11, 10, 12, 10, 11, 10, 11] # Avg ~11, StdDev very small
        for amt in small_amounts:
            self.engine.analyze(self.user_id, amt)
            
        # 2. Try a huge jump (Massive outlier)
        status, reason = self.engine.analyze(self.user_id, 5000.0)
        
        self.assertEqual(status, "REJECTED")
        self.assertIn("Anomaly", reason)

if __name__ == '__main__':
    unittest.main()