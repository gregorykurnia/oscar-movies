#!/usr/bin/env bash
# Screenshots of each design direction: desktop.png (1440x900) and phone.png (390x844).
# Usage: design/directions/shoot.sh [direction-folder ...]   (default: every folder with an index.html)
# Loads only local file:// pages. Fonts come from Google Fonts, so it needs a network connection.
set -euo pipefail
cd "$(dirname "$0")"

dirs=("$@")
if [ ${#dirs[@]} -eq 0 ]; then
  for f in */index.html; do dirs+=("$(dirname "$f")"); done
fi

# Chrome's headless shell (system, or Playwright's cached copy); otherwise npx playwright.
# Not full Chrome: its headless mode won't make a window narrower than 500px, so phone shots come out cropped.
chrome="$(command -v chrome-headless-shell 2>/dev/null || true)"
if [ -z "$chrome" ]; then
  chrome="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell \
                   "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell \
                   2>/dev/null | sort -V | tail -1 || true)"
fi

shot() { # dir file width height
  local url="file://$PWD/$1/index.html" out="$PWD/$1/$2"
  if [ -n "$chrome" ]; then
    "$chrome" --disable-gpu --no-sandbox --hide-scrollbars \
      --force-device-scale-factor=2 --window-size="$3,$4" \
      --virtual-time-budget=6000 --screenshot="$out" "$url" >/dev/null 2>&1
  else
    npx -y playwright screenshot --viewport-size="$3,$4" --wait-for-timeout=2000 "$url" "$out" >/dev/null
  fi
  echo "$out"
}

shots=()
for d in "${dirs[@]}"; do
  shots+=("$(shot "$d" desktop.png 1440 900)")
  shots+=("$(shot "$d" phone.png 390 844)")
done

# Open them where there's a screen to open them on; otherwise the paths above are the result.
if command -v open >/dev/null 2>&1 && [ "$(uname)" = Darwin ]; then
  open "${shots[@]}"
elif [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
  for s in "${shots[@]}"; do xdg-open "$s" >/dev/null 2>&1 & done
fi
