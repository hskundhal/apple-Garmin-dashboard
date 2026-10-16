#!/usr/bin/env python3
"""Interactive CLI login for Garmin Connect with 2FA / Passcode support."""

import getpass
import sys
from pathlib import Path
from garminconnect import Garmin

TOKEN_DIR = Path(__file__).resolve().parent.parent / ".garmin_tokens"

def main():
    print("=" * 60)
    print("Garmin Connect Authentication & Token Setup")
    print("=" * 60)
    print(f"Tokens will be saved to: {TOKEN_DIR}\n")

    email = input("Garmin Email: ").strip()
    password = getpass.getpass("Garmin Password: ").strip()

    if not email or not password:
        print("Error: Email and password are required.")
        sys.exit(1)

    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    client = Garmin(email, password, return_on_mfa=True)

    print("\nConnecting to Garmin...")
    mfa_status, _ = client.login()

    if mfa_status == "needs_mfa":
        print("\n" + "*" * 50)
        print("SECURITY PASSCODE REQUIRED")
        print("Garmin has sent a verification code to your email/phone.")
        print("*" * 50)
        mfa_code = input("Enter Garmin Security Passcode: ").strip()
        print("\nVerifying passcode with Garmin...")
        client.resume_login({}, mfa_code)

    client.client.dump(str(TOKEN_DIR))
    print(f"\n✓ Successfully logged in! Saved session tokens to: {TOKEN_DIR}")
    print("Your dashboard will now automatically sync without asking for credentials again.")

if __name__ == "__main__":
    main()
