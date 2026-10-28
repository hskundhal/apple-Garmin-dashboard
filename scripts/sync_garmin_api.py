#!/usr/bin/env python3
"""CLI utility to sync Garmin data using a Personal API Key."""

import argparse
import sys
from pathlib import Path

# Ensure project root is in path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.database import get_db, get_garmin_api_key
from backend.garmin_personal_api import GarminPersonalApiProvider


def main():
    parser = argparse.ArgumentParser(description="Sync Garmin Connect data using Personal API Key")
    parser.add_argument("--key", type=str, default="", help="Garmin Personal API Key (starts with GCDC_)")
    parser.add_argument("--days", type=int, default=0, help="Days of history (0 = all available history)")
    args = parser.parse_args()

    api_key = args.key.strip()
    if not api_key:
        conn = get_db()
        try:
            api_key = get_garmin_api_key(conn) or ""
        finally:
            conn.close()

    if not api_key:
        key_file = ROOT / "data" / ".garmin_api_key"
        if key_file.exists():
            api_key = key_file.read_text().strip()

    if not api_key:
        print("Error: No API key provided and no saved key found.")
        print("Please pass --key GCDC_... or save your key in the dashboard UI.")
        sys.exit(1)

    print(f"Connecting to Garmin Personal API (key: {api_key[:9]}...{api_key[-4:]})...")
    provider = GarminPersonalApiProvider(api_key)

    def progress(msg):
        print(f"▶ {msg}")

    result = provider.full_sync(days_back=args.days, progress_cb=progress)
    print("\n✓ Sync completed successfully!")
    print(f"  Activities:     {result.get('activities', 0)}")
    print(f"  Sleep Sessions: {result.get('sleep_sessions', 0)}")
    print(f"  HRV Records:    {result.get('hrv_records', 0)}")
    print(f"  Metrics:        {result.get('metrics', {})}")


if __name__ == "__main__":
    main()

