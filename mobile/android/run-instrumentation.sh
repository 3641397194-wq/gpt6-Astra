#!/usr/bin/env bash
# Copyright (C) 2026 ColdCoffee contributors.
# SPDX-License-Identifier: GPL-3.0-only

set -o pipefail

for attempt in 1 2; do
  echo "::group::Android instrumentation attempt ${attempt}/2"
  if bash mobile/android/gradlew -p mobile/android --no-daemon :app:connectedDebugAndroidTest; then
    echo "::endgroup::"
    exit 0
  else
    status=$?
  fi
  echo "::endgroup::"

  if [ "$attempt" -eq 2 ]; then
    exit "$status"
  fi

  echo "Instrumentation attempt ${attempt} failed; resetting the synthetic debug app before retry."
  adb shell am force-stop com.coldcoffee.mobile.debug || true
  adb shell pm clear com.coldcoffee.mobile.debug || true
  adb logcat -d -t 200 > "$RUNNER_TEMP/android-log-attempt-${attempt}.txt" || true
  sleep 8
done
