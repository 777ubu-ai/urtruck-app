#!/bin/bash
set -e

# Конфигурация из .env (секреты не в коде!)
if [ -f .env ]; then
  source .env
fi

SERVER_HOST="${SSH_HOST:?SSH_HOST not set — add to .env}"
SERVER_USER="${SSH_USER:-ubuntu}"
SERVER="${SERVER_USER}@${SERVER_HOST}"
REMOTE_DIR="/home/ubuntu/urtruck/frontend"
VERSIONS_DIR="/home/ubuntu/urtruck/versions"

# Автоинкремент версии
CURRENT_VERSION=$(cat .version 2>/dev/null || echo "56")
NEW_VERSION=$((CURRENT_VERSION + 1))
echo $NEW_VERSION > .version

echo "🚛 UrTruck Deploy v$NEW_VERSION"
echo "================================="

echo "1. Сборка веб-версии..."
npx expo export --platform web

echo "1a. Перенос brand-share превью (og:image) в dist/share/..."
mkdir -p dist/share
# og-default.png is the fallback social preview. Telegram/WhatsApp/Twitter
# scrapers pull it via og:image meta. Keep og-trip-template.svg too — backend
# can fetch it later for per-trip rendering.
cp web/share/og-default.png dist/share/og-default.png
cp web/share/og-trip-template.svg dist/share/og-trip-template.svg

echo "1b. Перенос legal-страниц (privacy/terms/support) в dist/legal/..."
# Статические HTML вне SPA — нужны для App Store / Google Play (рабочий URL политики).
mkdir -p dist/legal
cp web/legal/*.html dist/legal/

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
    <meta name="theme-color" content="#0A1628" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="UrTruck" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta property="og:title" content="UrTruck · FTL Market" />
    <meta property="og:description" content="Международные перевозки без посредников. Грузы, машины, ставки и сделки в одном приложении." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://urtruck.kz/" />
    <meta property="og:image" content="https://urtruck.kz/share/og-default.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:site_name" content="UrTruck" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="UrTruck · FTL Market" />
    <meta name="twitter:description" content="Международные перевозки без посредников." />
    <meta name="twitter:image" content="https://urtruck.kz/share/og-default.png" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 128 128%22><rect width=%22128%22 height=%22128%22 fill=%22%230A1628%22 rx=%2228%22/><text x=%2264%22 y=%2272%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2226%22 font-weight=%22900%22 fill=%22%23378ADD%22>UrTruck</text><text x=%2264%22 y=%2296%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2210%22 font-weight=%22700%22 fill=%22%23FFFFFF%22>LOGISTICS</text></svg>" />
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 128 128%22><rect width=%22128%22 height=%22128%22 fill=%22%230A1628%22 rx=%2228%22/><text x=%2264%22 y=%2272%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2226%22 font-weight=%22900%22 fill=%22%23378ADD%22>UrTruck</text><text x=%2264%22 y=%2296%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2210%22 font-weight=%22700%22 fill=%22%23FFFFFF%22>LOGISTICS</text></svg>" />'''

html = re.sub(r'<meta charset="utf-8" />.*?<title>UrTruck</title>', new_head, html, flags=re.DOTALL)

loading_html = '''<div id="root"><div style="display:flex;flex:1;height:100vh;align-items:center;justify-content:center;background:#0A1628;flex-direction:column;gap:16px"><div style="color:#378ADD;font-size:46px;font-weight:900;letter-spacing:-1.5px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">UrTruck</div><div style="color:#FFFFFF;font-size:12px;font-weight:700;letter-spacing:3px">INTERNATIONAL LOGISTICS</div></div></div><style>@keyframes truck{from{transform:translateX(-300px);opacity:0}to{transform:translateX(0);opacity:1}}</style><script>
(async()=>{
  const V='v8-market';
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
      const reg=await navigator.serviceWorker.register('/sw.js?v=8');
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
    "background_color": "#0A1628",
    "theme_color": "#0A1628",
    "orientation": "portrait",
    "icons": [
        {"src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' fill='%230A1628' rx='36'/><text x='96' y='108' text-anchor='middle' font-family='sans-serif' font-size='40' font-weight='900' fill='%23378ADD'>UrTruck</text><text x='96' y='144' text-anchor='middle' font-family='sans-serif' font-size='14' font-weight='700' fill='%23FFFFFF'>LOGISTICS</text></svg>",
         "sizes": "192x192", "type": "image/svg+xml"},
        {"src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' fill='%230A1628' rx='96'/><text x='256' y='288' text-anchor='middle' font-family='sans-serif' font-size='106' font-weight='900' fill='%23378ADD'>UrTruck</text><text x='256' y='380' text-anchor='middle' font-family='sans-serif' font-size='36' font-weight='700' fill='%23FFFFFF'>LOGISTICS</text></svg>",
         "sizes": "512x512", "type": "image/svg+xml"}
    ]
}
with open('dist/manifest.json', 'w') as f:
    json.dump(manifest, f, ensure_ascii=False)

print('  ✓ index.html + manifest.json + sw.js готовы')
PY

echo "3. Загрузка на сервер (current + v$NEW_VERSION)..."
# Используем rsync (или scp с ssh-ключом)
rsync -avz --delete -e "ssh -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no" dist/ "${SERVER}:${REMOTE_DIR}/" 2>/dev/null || \
  scp -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -r dist/* "${SERVER}:${REMOTE_DIR}/"
# Версионированная копия
ssh -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no "$SERVER" "mkdir -p $VERSIONS_DIR/v$NEW_VERSION" 2>/dev/null || true
rsync -avz -e "ssh -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no" dist/ "${SERVER}:${VERSIONS_DIR}/v$NEW_VERSION/" 2>/dev/null || \
  scp -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -r dist/* "${SERVER}:${VERSIONS_DIR}/v$NEW_VERSION/"

echo "4. Установка прав + очистка старых версий..."
ssh -i ~/.ssh/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no "$SERVER" "chmod -R 755 $REMOTE_DIR $VERSIONS_DIR && cd $VERSIONS_DIR && ls -dt v* | tail -n +11 | xargs rm -rf 2>/dev/null; echo 'Versions:' && ls -d v* | sort -V | tail -5" 2>/dev/null || true

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
