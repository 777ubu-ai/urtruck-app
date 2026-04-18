#!/bin/bash
set -e

# Конфигурация из .env (секреты не в коде!)
if [ -f .env ]; then
  source .env
fi

SERVER_HOST="${SSH_HOST:?SSH_HOST not set — add to .env}"
SERVER_USER="${SSH_USER:-ubuntu}"
SERVER="${SERVER_USER}@${SERVER_HOST}"
REMOTE_DIR="/home/ubuntu/urtruck-app"
VERSIONS_DIR="/home/ubuntu/urtruck-versions"

# Автоинкремент версии
CURRENT_VERSION=$(cat .version 2>/dev/null || echo "56")
NEW_VERSION=$((CURRENT_VERSION + 1))
echo $NEW_VERSION > .version

echo "🚛 UrTruck Deploy v$NEW_VERSION"
echo "================================="

echo "1. Сборка веб-версии..."
npx expo export --platform web

echo "2. Пост-обработка index.html + PWA + SW..."
cp sw-template.js dist/sw.js

python3 <<'PY'
import re, json
with open('dist/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

new_head = '''<meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta http-equiv="Cache-Control" content="no-store" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, maximum-scale=1" />
    <title>UrTruck · FTL Market</title>
    <meta name="description" content="UrTruck — FTL грузоперевозки без посредников" />
    <meta name="theme-color" content="#0B0F1A" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="UrTruck" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta property="og:title" content="UrTruck · FTL Market" />
    <meta property="og:description" content="Грузоперевозки без посредников" />
    <meta property="og:type" content="website" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚛</text></svg>" />
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚛</text></svg>" />'''

html = re.sub(r'<meta charset="utf-8" />.*?<title>UrTruck</title>', new_head, html, flags=re.DOTALL)

loading_html = '''<div id="root"><div style="display:flex;flex:1;height:100vh;align-items:center;justify-content:center;background:#0B0F1A;flex-direction:column;gap:16px"><div style="font-size:60px;animation:truck 1.5s ease-out">🚛</div><div style="color:#FAFAF9;font-size:32px;font-weight:900;letter-spacing:-1px">UrTruck</div><div style="color:#78716C;font-size:13px">FTL Market</div></div></div><style>@keyframes truck{from{transform:translateX(-300px);opacity:0}to{transform:translateX(0);opacity:1}}</style><script>
(async()=>{
  const V='v5-market';
  const cur=localStorage.getItem('ur_sw_v');
  if(cur!==V){
    if('caches' in window){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}
    if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()))}
    localStorage.setItem('ur_sw_v',V);
    location.reload();
    return;
  }
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('/sw.js?v=5');
      if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'})}
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        nw&&nw.addEventListener('statechange',()=>{
          if(nw.state==='installed'&&navigator.serviceWorker.controller){
            nw.postMessage({type:'SKIP_WAITING'});
            setTimeout(()=>location.reload(),300)
          }
        })
      })
    }catch(e){}
  }
})();
</script>'''
html = html.replace('<div id="root"></div>', loading_html)

with open('dist/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

manifest = {
    "name": "UrTruck · FTL Market",
    "short_name": "UrTruck",
    "description": "FTL грузоперевозки без посредников",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0B0F1A",
    "theme_color": "#0B0F1A",
    "orientation": "portrait",
    "icons": [
        {"src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' fill='%230C0A09' rx='32'/><text x='96' y='140' font-size='120' text-anchor='middle'>🚛</text></svg>",
         "sizes": "192x192", "type": "image/svg+xml"},
        {"src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' fill='%230C0A09' rx='80'/><text x='256' y='370' font-size='320' text-anchor='middle'>🚛</text></svg>",
         "sizes": "512x512", "type": "image/svg+xml"}
    ]
}
with open('dist/manifest.json', 'w') as f:
    json.dump(manifest, f, ensure_ascii=False)

print('  ✓ index.html + manifest.json + sw.js готовы')
PY

echo "3. Загрузка на сервер (current + v$NEW_VERSION)..."
# Используем rsync (или scp с ssh-ключом)
rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" dist/ "${SERVER}:${REMOTE_DIR}/" 2>/dev/null || \
  scp -o StrictHostKeyChecking=no -r dist/* "${SERVER}:${REMOTE_DIR}/"
# Версионированная копия
ssh -o StrictHostKeyChecking=no "$SERVER" "mkdir -p $VERSIONS_DIR/v$NEW_VERSION" 2>/dev/null || true
rsync -avz -e "ssh -o StrictHostKeyChecking=no" dist/ "${SERVER}:${VERSIONS_DIR}/v$NEW_VERSION/" 2>/dev/null || \
  scp -o StrictHostKeyChecking=no -r dist/* "${SERVER}:${VERSIONS_DIR}/v$NEW_VERSION/"

echo "4. Установка прав + очистка старых версий..."
ssh -o StrictHostKeyChecking=no "$SERVER" "chmod -R 755 $REMOTE_DIR $VERSIONS_DIR && cd $VERSIONS_DIR && ls -dt v* | tail -n +11 | xargs rm -rf 2>/dev/null; echo 'Versions:' && ls -d v* | sort -V | tail -5" 2>/dev/null || true

echo "5. Проверка..."
SITE=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}:8080/")
MANIFEST=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}:8080/manifest.json")
SW=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}:8080/sw.js")
echo "  Site: $SITE · Manifest: $MANIFEST · SW: $SW"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Деплой готов: v$NEW_VERSION"
echo "  🔗 http://${SERVER_HOST}:8080"
echo "  🔗 http://${SERVER_HOST}:8080/v$NEW_VERSION"
echo "═══════════════════════════════════════════"
echo ""
