# Локальный стенд для теста оплаты и лимитов (ветка payments).
# Поднимает: бэкенд :8001 → cloudflared-туннель → веб-версия :8090 (второй аккаунт).
# Подробности и сборка APK под туннель — docs/release/local-payments-testing.md
#
# Запуск из корня репо:  powershell -ExecutionPolicy Bypass -File scripts\local-payments-stack.ps1
#   -SkipWebBuild   не пересобирать dist/ (если фронт не менялся)
#   -SkipInstall    не ставить зависимости бэкенда
param(
  [switch]$SkipWebBuild,
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root '.local-stack'
New-Item -ItemType Directory -Force $logs | Out-Null

# Бэкенду нужен Python 3.12+ (на 3.10 старт падает внутри re/sre_parse).
$venv = Join-Path $root 'backend\venv'
$py = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $py)) {
  Write-Host '[stack] создаю backend\venv на Python 3.13'
  & py -3.13 -m venv $venv
}
if (-not $SkipInstall) {
  Write-Host '[stack] зависимости бэкенда'
  & $py -m pip install -q -r (Join-Path $root 'backend\requirements.txt')
}

# Освобождаем порты от прошлого запуска.
foreach ($port in 8001, 8090) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false

Write-Host '[stack] бэкенд :8001'
Start-Process -FilePath $py -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden `
  -ArgumentList '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001' `
  -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend.err.log')

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-RestMethod -TimeoutSec 2 http://127.0.0.1:8001/api/v1/system/info | Out-Null; $ok = $true; break } catch { Start-Sleep 1 }
}
if (-not $ok) { throw "бэкенд не поднялся, см. $logs\backend.err.log" }

Write-Host '[stack] cloudflared-туннель'
$tunnelLog = Join-Path $logs 'tunnel.log'
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
Start-Process -FilePath 'cloudflared' -WindowStyle Hidden `
  -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8001' `
  -RedirectStandardError $tunnelLog -RedirectStandardOutput (Join-Path $logs 'tunnel.out.log')
$tunnelUrl = $null
for ($i = 0; $i -lt 60 -and -not $tunnelUrl; $i++) {
  Start-Sleep 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $tunnelUrl = $m.Matches[0].Value }
  }
}
if (-not $tunnelUrl) { throw "туннель не поднялся, см. $tunnelLog" }

if (-not $SkipWebBuild) {
  Write-Host '[stack] сборка веб-версии (dist/)'
  Push-Location $root
  try { & npm run -s build:web; if ($LASTEXITCODE) { throw 'build:web упал' } } finally { Pop-Location }
}

Write-Host '[stack] веб-версия :8090'
$env:E2E_PORT = '8090'
Start-Process -FilePath 'node' -WorkingDirectory $root -WindowStyle Hidden `
  -ArgumentList 'scripts/e2e-static-proxy.js' `
  -RedirectStandardOutput (Join-Path $logs 'web.log') -RedirectStandardError (Join-Path $logs 'web.err.log')

Write-Host ''
Write-Host "Туннель:     $tunnelUrl"
Write-Host 'Веб-версия:  http://localhost:8090/'
Write-Host "Логи:        $logs"
Write-Host ''
Write-Host 'APK на планшете ходит на тот туннель, под который он собран. Если адрес'
Write-Host 'другой — пересобрать APK (docs/release/local-payments-testing.md, шаг 2).'
