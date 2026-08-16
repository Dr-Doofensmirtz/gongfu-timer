#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML file.

The result has no external requests at all, so it runs straight off a phone's
storage over file:// — no server, no network. It cannot install as a PWA that
way (browsers only install from https), so it is a fallback, not a replacement
for hosting the real thing.

    python3 build-standalone.py    ->  dist/gongfu-timer.html
"""

import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"


def main():
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "styles.css").read_text()
    js = (ROOT / "app.js").read_text()
    icon = base64.b64encode((ROOT / "icons" / "apple-touch-icon.png").read_bytes()).decode()

    # No manifest or service worker is reachable from file://.
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html = re.sub(
        r'<link rel="apple-touch-icon"[^>]*>',
        f'<link rel="apple-touch-icon" href="data:image/png;base64,{icon}">',
        html,
    )
    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace(
        '<script src="app.js"></script>',
        f"<script>\n{js}\n</script>",
    )

    if "styles.css" in html or 'src="app.js"' in html:
        raise SystemExit("inlining failed — index.html markup changed")

    DIST.mkdir(exist_ok=True)
    out = DIST / "gongfu-timer.html"
    out.write_text(html)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
