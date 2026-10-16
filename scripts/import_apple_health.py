"""CLI script to import Apple Health export.zip into the dashboard."""

import sys
from pathlib import Path

# Add project root to sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.apple_health_provider import extract_export_xml, import_apple_health
from backend.database import init_db

def main():
    zip_path = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/export.zip").expanduser()
    if not zip_path.exists():
        print(f"Error: {zip_path} not found.")
        sys.exit(1)

    print(f"Found archive: {zip_path} ({zip_path.stat().st_size / (1024*1024):.1f} MB)")
    init_db()

    dest_dir = ROOT / "apple_health_export"
    print(f"Extracting export.xml to {dest_dir}...")
    xml_path = extract_export_xml(zip_path, dest_dir)

    print(f"Parsing Apple Health XML ({xml_path.stat().st_size / (1024*1024):.1f} MB)...")
    def progress(n):
        print(f"  Parsed {n:,} records...", end="\r")

    result = import_apple_health(xml_path, progress_cb=progress)
    print("\n✓ Import complete!")
    print(f"  Records processed: {result['records']:,}")
    print(f"  Workouts imported: {result['workouts']:,}")
    print(f"  Sleep sessions:    {result['sleep_records']:,}")
    print(f"  Metric types:      {', '.join(result['metric_types'])}")

if __name__ == "__main__":
    main()
