#!/usr/bin/env bash
# Capture unmodified, empty-key screens from the same iPhone Simulator used by CI tests.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 SIMULATOR_ID DEBUG_APP_PATH OUTPUT_DIR" >&2
  exit 2
fi

device_id="$1"
app="$2"
output_dir="$3"
bundle_id="com.coldcoffee.mobile.ios"

[[ -d "$app" ]] || { echo "Debug simulator app not found: $app" >&2; exit 1; }
command -v xcrun >/dev/null || { echo "xcrun is required" >&2; exit 1; }

if ! xcrun simctl list devices booted | grep -Fq "$device_id"; then
  xcrun simctl boot "$device_id"
fi
xcrun simctl bootstatus "$device_id" -b
mkdir -p "$output_dir"
xcrun simctl install "$device_id" "$app"

for tab in home chat work community; do
  xcrun simctl terminate "$device_id" "$bundle_id" >/dev/null 2>&1 || true
  xcrun simctl launch "$device_id" "$bundle_id" --coldcoffee-screenshot-tab "$tab"
  sleep 2
  image="$output_dir/coldcoffee-ios-$tab.png"
  xcrun simctl io "$device_id" screenshot "$image"
  [[ -s "$image" ]] || { echo "Screenshot is empty: $image" >&2; exit 1; }
done

echo "Captured four iOS screens in $output_dir"
