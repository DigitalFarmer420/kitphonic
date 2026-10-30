#!/bin/sh
# Backup: full bundle (base) + incremental bundle of commits since the base (store quota is ~17 MB).
S=/cursor/stores/store-322884d4-1065-45e4-b960-b64e9331e657/kitphonic-backup
BASE=$(git bundle list-heads "$S/kitphonic.bundle" | awk '/refs\/heads\/master/{print $1}')
git bundle create /tmp/kp-inc.bundle "$BASE..master" && cp /tmp/kp-inc.bundle "$S/kitphonic-inc.bundle" && git bundle verify "$S/kitphonic-inc.bundle" >/dev/null 2>&1 && echo "backup ok: base ${BASE%"${BASE#???????}"} + inc to $(git rev-parse --short HEAD)"
