#!/usr/bin/env python3
"""Inject a visible DEV badge and a noindex meta into index.html.
Used ONLY when deploying develop to kitphonic-dev; production (main) never runs this.
No analytics, no network requests, no third-party scripts: inline CSS + one div only."""
import sys, pathlib
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "index.html")
html = p.read_text(encoding="utf-8")
if 'id="dev-badge"' in html:
    sys.exit(0)
for tag in ("</head>", "</body>"):
    if tag not in html:
        sys.exit(f"inject-dev-badge: {tag} not found in {p}")
head = ('<meta name="robots" content="noindex,nofollow">'
        '<style id="dev-badge-style">#dev-badge{position:fixed;top:calc(env(safe-area-inset-top,0px) + 2px);'
        'left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;'
        'background:#e5482d;color:#fff;font:700 10px/1 -apple-system,system-ui,sans-serif;'
        'letter-spacing:.08em;padding:3px 7px;border-radius:999px;opacity:.85;'
        'box-shadow:0 1px 3px rgba(0,0,0,.4)}</style>\n')
body = '<div id="dev-badge" aria-hidden="true">DEV</div>\n'
html = html.replace("</head>", head + "</head>", 1)
html = html.replace("<title>", "<title>DEV · ", 1)
i = html.rfind("</body>")
html = html[:i] + body + html[i:]
p.write_text(html, encoding="utf-8")
print("DEV badge injected into", p)
