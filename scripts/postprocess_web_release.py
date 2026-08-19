#!/usr/bin/env python3
"""Prepare Expo web export for UrTruck production deployment."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

DIST = Path("dist")
INDEX = DIST / "index.html"
SW_TEMPLATE = Path("sw-template.js")

html = INDEX.read_text(encoding="utf-8")

if '<link rel="manifest"' not in html:
    html = html.replace("</head>", '<link rel="manifest" href="/manifest.json" />\n</head>')

early_theme = r'''<script>
(function(){try{
  var t=localStorage.getItem('ur_theme');
  var dark=t==='dark'||((!t||t==='system'||t==='auto')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var bg=dark?'#0F1512':'#F6F8F7';
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  document.documentElement.style.backgroundColor=bg;
  var m=document.querySelector('meta[name="theme-color"]');
  if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}
  m.setAttribute('content',bg);
}catch(e){}})();
</script>'''
if "ur_theme" not in html:
    html = html.replace("</head>", early_theme + "\n</head>")

# 2026-08-19: was a hardcoded "v16-market" / "16" default, never overridden
# by any deploy path (deploy.sh or CI) — every single release kept writing
# the SAME epoch into index.html even after sw-template.js's own CACHE name
# moved on to v18. A returning visitor whose localStorage already had
# ur_sw_v="v16-market" from ANY earlier deploy never saw the force-refresh
# fire again: cur !== V was permanently false, so new bundles stayed
# invisible behind a stale Service Worker until the browser's own
# (unreliable, non-immediate) native SW update heartbeat happened to catch
# up. Derive the epoch FROM sw-template.js's actual cache name instead of a
# second, independently-hand-bumped literal, so the two can never drift
# apart again — this is what actually forces every deploy to bust the
# cache for existing visitors, not just first-time ones.
_sw_source = SW_TEMPLATE.read_text(encoding="utf-8")
_match = re.search(r"CACHE\s*=\s*'urtruck-(v\d+)-market'", _sw_source)
if not _match:
    raise SystemExit(f"could not find CACHE = 'urtruck-vN-market' in {SW_TEMPLATE}")
_detected_version = _match.group(1)  # e.g. "v18"
SW_EPOCH = os.environ.get("URTRUCK_SW_EPOCH", f"{_detected_version}-market")
SW_QUERY = os.environ.get("URTRUCK_SW_QUERY", _detected_version.lstrip("v"))
bootstrap = f'''<script>
(async()=>{{
  const V={json.dumps(SW_EPOCH)};
  const cur=localStorage.getItem('ur_sw_v');
  if(cur!==V){{
    if('caches' in window){{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}}
    if('serviceWorker' in navigator){{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()))}}
    localStorage.setItem('ur_sw_v',V);
    location.reload();
    return;
  }}
  if('serviceWorker' in navigator){{
    try{{
      const reg=await navigator.serviceWorker.register('/sw.js?v={SW_QUERY}');
      if(reg.waiting){{reg.waiting.postMessage({{type:'SKIP_WAITING'}})}}
      reg.addEventListener('updatefound',()=>{{
        const nw=reg.installing;
        nw&&nw.addEventListener('statechange',()=>{{
          if(nw.state==='installed'&&navigator.serviceWorker.controller){{
            nw.postMessage({{type:'SKIP_WAITING'}});
            setTimeout(()=>location.reload(),300);
          }}
        }});
      }});
    }}catch(e){{}}
  }}
}})();
</script>'''
if "ur_sw_v" not in html:
    html = html.replace("</body>", bootstrap + "\n</body>")

INDEX.write_text(html, encoding="utf-8")

manifest = {
    "name": "UrTruck · FTL Market",
    "short_name": "UrTruck",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#F6F8F7",
    "theme_color": "#F6F8F7",
}
(DIST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
