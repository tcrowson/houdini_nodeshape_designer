#!/usr/bin/env python3
"""
Build a self-contained single-file HTML bundle of Houdini NodeShape Designer.
Outputs: dist/houdini_nodeshape_designer.zip

Usage:  python3 build.py
"""

import os
import re
import zipfile
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')

def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()

def fetch_font():
    """Fetch Barlow Black from Google Fonts and return an embedded @font-face block."""
    # Request the CSS with a desktop UA so Google returns woff2
    url = 'https://fonts.googleapis.com/css2?family=Barlow:wght@900&display=swap'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120'
    })
    try:
        css = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
    except Exception as e:
        print(f'  Warning: could not fetch Google Font ({e}). Falling back to system font.')
        return None

    # Find the woff2 URL inside the CSS
    woff2_url = re.search(r"url\((https://fonts\.gstatic\.com[^)]+\.woff2)\)", css)
    if not woff2_url:
        print('  Warning: could not parse font URL. Falling back to system font.')
        return None

    try:
        font_data = urllib.request.urlopen(woff2_url.group(1), timeout=10).read()
    except Exception as e:
        print(f'  Warning: could not download font binary ({e}). Falling back to system font.')
        return None

    import base64
    b64 = base64.b64encode(font_data).decode('ascii')
    return (
        "<style>\n"
        "@font-face {\n"
        "  font-family: 'Barlow';\n"
        "  font-style: normal;\n"
        "  font-weight: 900;\n"
        f"  src: url('data:font/woff2;base64,{b64}') format('woff2');\n"
        "}\n"
        "</style>"
    )

def build():
    os.makedirs(DIST, exist_ok=True)

    html   = read(os.path.join(ROOT, 'index.html'))
    css    = read(os.path.join(ROOT, 'src', 'style.css'))
    js     = read(os.path.join(ROOT, 'src', 'app.js'))

    print('Fetching Barlow font for offline embedding...')
    font_block = fetch_font()

    # Remove no-cache meta tags (not useful in a local file)
    html = re.sub(r'\s*<meta http-equiv="Cache-Control"[^>]+>\n?', '', html)
    html = re.sub(r'\s*<meta http-equiv="Pragma"[^>]+>\n?', '', html)
    html = re.sub(r'\s*<meta http-equiv="Expires"[^>]+>\n?', '', html)

    # Replace Google Fonts links with embedded font (or remove if fetch failed)
    html = re.sub(r'<link rel="preconnect"[^>]+>\n?', '', html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]+>\n?', '', html)
    if font_block:
        html = html.replace('</head>', font_block + '\n</head>', 1)
        print('  Font embedded successfully.')

    # Inline CSS
    html = html.replace(
        '<link rel="stylesheet" href="src/style.css">',
        f'<style>\n{css}\n</style>'
    )

    # Inline JS
    html = html.replace(
        '<script src="src/app.js"></script>',
        f'<script>\n{js}\n</script>'
    )

    html_name = 'houdini_nodeshape_designer.html'
    zip_path = os.path.join(DIST, 'houdini_nodeshape_designer.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(html_name, html)

    size_kb = os.path.getsize(zip_path) / 1024
    print(f'Bundle written: dist/houdini_nodeshape_designer.zip ({size_kb:.0f} KB)')

if __name__ == '__main__':
    build()
