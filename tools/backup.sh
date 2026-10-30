#!/bin/sh
# Backup: full git bundle to the bot store (built + verified in /tmp first, then copied over the previous one).
# If the store refuses the full bundle (quota), fall back to an incremental bundle on top of the stored one.
S=/cursor/stores/store-322884d4-1065-45e4-b960-b64e9331e657/kitphonic-backup
git bundle create /tmp/kp-full.bundle --all 2>/dev/null && git bundle verify /tmp/kp-full.bundle >/dev/null 2>&1 || { echo "bundle build failed"; exit 1; }
if cp /tmp/kp-full.bundle "$S/kitphonic.bundle" 2>/dev/null && git bundle verify "$S/kitphonic.bundle" >/dev/null 2>&1; then
  rm -f "$S/kitphonic-inc.bundle"; echo "backup ok: full bundle at $(git rev-parse --short HEAD) ($(du -h "$S/kitphonic.bundle" | cut -f1))"
else
  echo "full bundle did not fit; trying incremental"
  BASE=$(git bundle list-heads "$S/kitphonic.bundle" 2>/dev/null | awk '/refs\/heads\/master/{print $1}')
  [ -n "$BASE" ] && git bundle create /tmp/kp-inc.bundle "$BASE..master" 2>/dev/null && cp /tmp/kp-inc.bundle "$S/kitphonic-inc.bundle" && echo "backup ok: base + inc to $(git rev-parse --short HEAD)" || echo "BACKUP FAILED"
fi
