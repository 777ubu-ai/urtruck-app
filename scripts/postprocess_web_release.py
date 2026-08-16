#!/usr/bin/env python3
"""Prepare Expo web export for UrTruck production deployment."""
from __future__ import annotations

import json
import os
from pathlib import Path

DIST = Path("dist")
INDEX = DIST / "index.html"

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

# Keep the epoch aligned with the current production SW. Feature releases
# bump the defaults here together with sw-template.js.
SW_EPOCH = os.environ.get("URTRUCK_SW_EPOCH", "v15-market")
SW_QUERY = os.environ.get("URTRUCK_SW_QUERY", "15")
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
