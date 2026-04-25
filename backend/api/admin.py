"""Admin Dashboard — HTML интерфейс для модераторов.

Защищён паролем через HTTP Basic Auth.
Credentials: ENV URTRUCK_ADMIN_USER и URTRUCK_ADMIN_PASS
"""
import sys
import os
import secrets
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from database import db

admin_router = APIRouter()
security = HTTPBasic()

ADMIN_USER = os.getenv("URTRUCK_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("URTRUCK_ADMIN_PASS", "urtruck-admin-2026")


def check_admin(credentials: HTTPBasicCredentials = Depends(security)):
    u_ok = secrets.compare_digest(credentials.username.encode(), ADMIN_USER.encode())
    p_ok = secrets.compare_digest(credentials.password.encode(), ADMIN_PASS.encode())
    if not (u_ok and p_ok):
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": 'Basic realm="UrTruck Admin"'},
        )
    return credentials.username


HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UrTruck Security · Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0C0A09; color: #FAFAF9; }
    .header { background: linear-gradient(135deg, #DC2626, #F59E0B); padding: 24px; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 900; }
    .header p { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat { background: #1C1917; border: 1px solid #292524; border-radius: 16px; padding: 20px; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #78716C; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; }
    .stat-value { font-size: 32px; font-weight: 900; }
    .stat-value.green { color: #22C55E; }
    .stat-value.yellow { color: #F59E0B; }
    .stat-value.red { color: #EF4444; }
    .stat-value.black { color: #DC2626; }
    .section { background: #1C1917; border: 1px solid #292524; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
    .section h2 { margin: 0 0 16px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px; color: #78716C; font-weight: 700; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #292524; }
    td { padding: 10px; border-bottom: 1px solid #292524; }
    .pill { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pill.green { background: #22C55E20; color: #22C55E; }
    .pill.yellow { background: #F59E0B20; color: #F59E0B; }
    .pill.red { background: #EF444420; color: #EF4444; }
    .pill.black { background: #DC262640; color: #FCA5A5; }
    .pill.critical { background: #DC262640; color: #FCA5A5; }
    .pill.high { background: #EF444430; color: #FCA5A5; }
    .pill.medium { background: #F59E0B30; color: #FCD34D; }
    .pill.negative { background: #EF444430; color: #FCA5A5; }
    .pill.positive { background: #22C55E30; color: #86EFAC; }
    .pill.neutral { background: #44403C; color: #A8A29E; }
    .pill.telegram { background: #0088CC30; color: #4DB5FF; }
    .pill.manual { background: #78716C30; color: #D6D3D1; }
    .pill.della { background: #7C3AED30; color: #C4B5FD; }
    .pill.ati { background: #F9731630; color: #FDBA74; }
    .refresh { background: #22C55E; color: #fff; border: 0; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 700; }
    .refresh:hover { background: #16A34A; }
    .code { font-family: monospace; font-size: 11px; color: #A8A29E; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡 UrTruck Security · Admin</h1>
    <p>Мониторинг скоринга водителей, blacklist и Telegram упоминаний</p>
  </div>

  <div class="container">
    <button class="refresh" onclick="load()">🔄 Обновить</button>

    <h2 style="margin-top:24px">Скоринг</h2>
    <div class="grid" id="scores-grid"></div>

    <h2>Общая статистика</h2>
    <div class="grid" id="stats-grid"></div>

    <div class="section" style="border-color:#F59E0B">
      <h2>⏳ На ручной проверке <span id="pending-count" style="color:#F59E0B;font-size:13px"></span></h2>
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <input id="search-q" placeholder="🔍 Поиск: phone, ФИО, номер авто, ИИН"
               style="flex:1;min-width:200px;padding:10px 14px;border:1px solid #44403C;border-radius:10px;background:#0C0A09;color:#FAFAF9;font-size:13px" />
        <select id="status-filter" style="padding:10px;border:1px solid #44403C;border-radius:10px;background:#0C0A09;color:#FAFAF9">
          <option value="">⏳ На проверке</option>
          <option value="approved">✅ Одобренные</option>
          <option value="rejected">⛔ Отклонённые</option>
          <option value="pending">📝 В процессе</option>
        </select>
        <button onclick="loadPending()" class="refresh">Найти</button>
        <a href="/admin/export/drivers.csv" download class="refresh" style="background:#7C3AED;text-decoration:none;display:inline-flex;align-items:center">📥 CSV</a>
      </div>
      <div id="pending-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px"></div>
    </div>

    <div class="section">
      <h2>⛔ Чёрный список <span id="bl-count" style="color:#78716C;font-size:13px"></span></h2>
      <table>
        <thead><tr><th>Телефон</th><th>Госномер</th><th>Имя</th><th>Причина</th><th>Источник</th><th>Severity</th><th>Дата</th></tr></thead>
        <tbody id="bl-body"></tbody>
      </table>
    </div>

    <div class="section">
      <h2>💬 Telegram упоминания <span id="tm-count" style="color:#78716C;font-size:13px"></span></h2>
      <table>
        <thead><tr><th>Чат</th><th>Телефон</th><th>Номер</th><th>Sentiment</th><th>Keywords</th><th>Текст</th></tr></thead>
        <tbody id="tm-body"></tbody>
      </table>
    </div>

    <div class="section">
      <h2>🚨 Активные алерты <span id="al-count" style="color:#78716C;font-size:13px"></span></h2>
      <table>
        <thead><tr><th>Тип</th><th>Severity</th><th>Driver</th><th>Сообщение</th><th>Когда</th></tr></thead>
        <tbody id="al-body"></tbody>
      </table>
    </div>
  </div>

<script>
async function loadPending() {
  const q = document.getElementById('search-q')?.value || '';
  const sf = document.getElementById('status-filter')?.value || '';
  const url = `/admin/data/pending?q=${encodeURIComponent(q)}&status_filter=${encodeURIComponent(sf)}`;
  const pending = await fetch(url).then(r => r.json());
  const pendingList = pending.pending || [];
  document.getElementById('pending-count').textContent = `(${pendingList.length})`;
  document.getElementById('pending-list').innerHTML = pendingList.length === 0
    ? '<div style="color:#78716C;padding:20px;text-align:center">Ничего не найдено</div>'
    : pendingList.map(d => renderPending(d)).join('');
}

async function load() {
  await loadPending();
  const [stats, bl, tm, al] = await Promise.all([
    fetch('/api/v1/stats').then(r => r.json()),
    fetch('/admin/data/blacklist').then(r => r.json()),
    fetch('/admin/data/mentions').then(r => r.json()),
    fetch('/api/v1/alerts/active').then(r => r.json()),
  ]);

  // Остальная статистика
  const scoresByColor = stats.scores_by_color || {};
  const colors = ['green', 'yellow', 'red', 'black'];
  const labels = { green: '🟢 Надёжные', yellow: '🟡 Новички', red: '🔴 Проблемы', black: '⛔ Забанены' };
  document.getElementById('scores-grid').innerHTML = colors.map(c => `
    <div class="stat">
      <div class="stat-label">${labels[c]}</div>
      <div class="stat-value ${c}">${scoresByColor[c] || 0}</div>
    </div>
  `).join('');

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat"><div class="stat-label">Blacklist</div><div class="stat-value red">${stats.blacklist_size || 0}</div></div>
    <div class="stat"><div class="stat-label">Telegram упоминаний</div><div class="stat-value">${stats.telegram_mentions || 0}</div></div>
    <div class="stat"><div class="stat-label">Активные алерты</div><div class="stat-value yellow">${stats.active_alerts || 0}</div></div>
  `;

  document.getElementById('bl-count').textContent = `(${bl.entries.length})`;
  document.getElementById('bl-body').innerHTML = bl.entries.map(e => `
    <tr>
      <td class="code">${e.phone || '—'}</td>
      <td class="code">${e.plate_number || '—'}</td>
      <td>${e.full_name || '—'}</td>
      <td>${e.reason || '—'}</td>
      <td><span class="pill ${e.source}">${e.source}</span></td>
      <td><span class="pill ${e.severity}">${e.severity}</span></td>
      <td class="code">${(e.created_at || '').split('.')[0]}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#78716C">Пусто</td></tr>';

  document.getElementById('tm-count').textContent = `(${tm.mentions.length})`;
  document.getElementById('tm-body').innerHTML = tm.mentions.slice(0, 20).map(m => {
    const kw = m.keywords_found ? JSON.parse(m.keywords_found).slice(0, 3).join(', ') : '';
    return `
    <tr>
      <td class="code">${m.chat_name}</td>
      <td class="code">${m.mentioned_phone || '—'}</td>
      <td class="code">${m.mentioned_plate || '—'}</td>
      <td><span class="pill ${m.sentiment}">${m.sentiment}</span></td>
      <td class="code">${kw}</td>
      <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.message_text || ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#78716C">Пусто</td></tr>';

  const alerts = al.alerts || [];
  document.getElementById('al-count').textContent = `(${alerts.length})`;
  document.getElementById('al-body').innerHTML = alerts.map(a => `
    <tr>
      <td class="code">${a.alert_type}</td>
      <td><span class="pill ${a.severity}">${a.severity}</span></td>
      <td class="code">${a.driver_id || '—'}</td>
      <td>${a.message || '—'}</td>
      <td class="code">${(a.created_at || '').split('.')[0]}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#78716C">Нет активных</td></tr>';
}

function renderPending(d) {
  const fmt = (url) => url ? `<a href="${url}" target="_blank"><img src="${url}" style="width:100px;height:70px;object-fit:cover;border-radius:8px;border:1px solid #44403C"/></a>` : '<span style="color:#78716C">—</span>';
  const score = d.security_score != null ? d.security_score : '—';
  const color = d.security_color || 'neutral';
  const reason = d.manual_review_reason || d.rejected_reason || '';
  return `
    <div style="background:#17140F;border:1px solid #F59E0B40;border-radius:14px;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-weight:800;font-size:16px">${d.full_name || 'Без имени'}</div>
          <div class="code">${d.phone || '—'} · ИИН ${d.iin || '—'}</div>
        </div>
        <span class="pill ${color}">${score} · ${color}</span>
      </div>
      <div class="code" style="margin-bottom:8px">
        ${d.vehicle_brand || ''} ${d.vehicle_year || ''} · ${d.vehicle_plate || ''} · ${d.vehicle_type || ''}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <div><div class="stat-label" style="margin:0 0 4px">Селфи</div>${fmt(d.selfie_url)}</div>
        <div><div class="stat-label" style="margin:0 0 4px">Права</div>${fmt(d.license_url)}</div>
        <div><div class="stat-label" style="margin:0 0 4px">Техпаспорт</div>${fmt(d.passport_url)}</div>
        <div><div class="stat-label" style="margin:0 0 4px">Авто</div>${fmt(d.vehicle_photo_url)}</div>
      </div>
      <div style="font-size:11px;color:#A8A29E;margin-bottom:10px">
        Liveness: ${Math.round((d.face_quality || 0) * 100)}% ·
        Face match: ${Math.round((d.face_match_score || 0) * 100)}% ·
        Уровень: ${d.verification_level || 0}
        ${reason ? '<br>⚠ ' + reason : ''}
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="moderate('${d.id}','approve')" style="flex:1;background:#22C55E;color:#fff;border:0;padding:10px;border-radius:8px;cursor:pointer;font-weight:700">✓ Одобрить</button>
        <button onclick="moderate('${d.id}','reject')" style="flex:1;background:#EF4444;color:#fff;border:0;padding:10px;border-radius:8px;cursor:pointer;font-weight:700">✗ Отклонить</button>
      </div>
    </div>`;
}

async function moderate(id, action) {
  let body = null;
  if (action === 'reject') {
    const reason = prompt('Причина отклонения:', 'Не соответствует требованиям');
    if (!reason) return;
    body = 'reason=' + encodeURIComponent(reason);
  }
  const r = await fetch(`/admin/${action}/${id}` + (body ? '?' + body : ''), { method: 'POST' });
  if (r.ok) {
    alert(action === 'approve' ? '✓ Одобрено' : '✗ Отклонено');
    load();
  } else {
    alert('Ошибка: ' + r.status);
  }
}

load();
setInterval(load, 30000); // auto-refresh 30 сек
</script>
</body>
</html>
"""


@admin_router.get("/", response_class=HTMLResponse)
def dashboard(user: str = Depends(check_admin)):
    return HTML


@admin_router.get("/data/blacklist")
def data_blacklist(user: str = Depends(check_admin)):
    from database.db import get_conn
    with get_conn() as c:
        rows = c.execute("SELECT * FROM blacklist WHERE is_active = 1 ORDER BY created_at DESC LIMIT 100").fetchall()
    return {"entries": [dict(r) for r in rows]}


@admin_router.get("/data/mentions")
def data_mentions(user: str = Depends(check_admin)):
    from database.db import get_conn
    with get_conn() as c:
        rows = c.execute("SELECT * FROM telegram_mentions ORDER BY created_at DESC LIMIT 100").fetchall()
    return {"mentions": [dict(r) for r in rows]}


@admin_router.get("/data/scores")
def data_scores(user: str = Depends(check_admin)):
    from database.db import get_conn
    with get_conn() as c:
        rows = c.execute("SELECT * FROM driver_scores ORDER BY updated_at DESC LIMIT 100").fetchall()
    return {"scores": [dict(r) for r in rows]}


# ---------- Pending Moderation ----------
@admin_router.get("/data/pending")
def data_pending(q: str = "", status_filter: str = "", user: str = Depends(check_admin)):
    """Водители ожидающие ручной проверки модератором.
    q — поиск по phone/name/plate/iin, status_filter — 'pending'|'under_review'|'manual_review'|'rejected'|'approved'|''.
    """
    from database.db import get_conn

    where = []
    params = []
    if status_filter:
        where.append("status = ?")
        params.append(status_filter)
    else:
        where.append("(status IN ('under_review', 'manual_review') OR manual_review_required = 1)")

    if q:
        where.append("""(
            phone LIKE ? OR full_name LIKE ? OR vehicle_plate LIKE ? OR iin LIKE ?
        )""")
        like = f"%{q}%"
        params.extend([like, like, like, like])

    where_sql = " AND ".join(where) if where else "1=1"
    with get_conn() as c:
        rows = c.execute(f"""
            SELECT id, phone, full_name, iin, vehicle_type, vehicle_plate,
                   vehicle_brand, vehicle_year, selfie_url, license_url, passport_url,
                   vehicle_photo_url, face_verified, face_quality, face_match_score,
                   license_verified, passport_verified, license_ocr, passport_ocr,
                   verification_level, status, moderation_score, security_score,
                   security_color, manual_review_required, manual_review_reason,
                   rejected_reason, created_at, updated_at
            FROM drivers_registration
            WHERE {where_sql}
            ORDER BY updated_at DESC
            LIMIT 200
        """, params).fetchall()
    return {"pending": [dict(r) for r in rows]}


@admin_router.get("/export/drivers.csv")
def export_drivers_csv(user: str = Depends(check_admin)):
    """Экспорт всех водителей в CSV (для бухгалтерии/маркетинга)."""
    from database.db import get_conn
    import csv
    from io import StringIO

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "phone", "full_name", "iin", "status", "role",
        "vehicle_type", "vehicle_plate", "vehicle_brand", "vehicle_year",
        "security_score", "security_color", "verification_level",
        "moderation_score", "created_at", "approved_at",
    ])
    with get_conn() as c:
        rows = c.execute("""
            SELECT id, phone, full_name, iin, status, role,
                   vehicle_type, vehicle_plate, vehicle_brand, vehicle_year,
                   security_score, security_color, verification_level,
                   moderation_score, created_at, approved_at
            FROM drivers_registration
            ORDER BY created_at DESC
        """).fetchall()
    for r in rows:
        writer.writerow([r[k] for k in r.keys()])
    csv_data = buf.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="urtruck-drivers.csv"'},
    )


@admin_router.post("/approve/{driver_id}")
def admin_approve(driver_id: str, user: str = Depends(check_admin)):
    from database import registration_dal as reg_dal
    from api.push import send_to_user
    d = reg_dal.get_driver(driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    reg_dal.update_driver(driver_id, {
        "status": "approved",
        "auto_approved": 0,
        "manual_review_required": 0,
        "verification_level": 3,
        "role": "driver",
        "approved_at": "CURRENT_TIMESTAMP",
    })
    # Push водителю
    try:
        send_to_user(driver_id, "🎉 UrTruck", "Документы одобрены! Можно брать рейсы.", url="/profile")
    except Exception as e:
        print(f"[push] approve failed: {e}")
    return {"ok": True, "id": driver_id, "action": "approved", "by": user}


@admin_router.post("/reject/{driver_id}")
def admin_reject(driver_id: str, reason: str = "Не прошёл проверку модератора", user: str = Depends(check_admin)):
    from database import registration_dal as reg_dal
    from api.push import send_to_user
    d = reg_dal.get_driver(driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    reg_dal.update_driver(driver_id, {
        "status": "rejected",
        "manual_review_required": 0,
        "rejected_reason": reason,
    })
    try:
        send_to_user(driver_id, "⛔ UrTruck", f"Документы отклонены: {reason}", url="/profile")
    except Exception as e:
        print(f"[push] reject failed: {e}")
    return {"ok": True, "id": driver_id, "action": "rejected", "reason": reason, "by": user}
