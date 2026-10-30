#!/bin/sh
# uses the Playwright venv when present (system python has no playwright)
PY=python3; [ -x /workspace/pwvenv/bin/python ] && PY=/workspace/pwvenv/bin/python
exec "$PY" tools/check-sizes.py "$@"
