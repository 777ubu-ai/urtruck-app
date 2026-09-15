'use client';

import { FormEvent, useEffect, useState } from 'react';
import ControlShell from './ControlShell';
import { can, ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/rbac';

type Staff = {
  username: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  mfaEnrolledAt?: string;
};

export default function StaffPage() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [myRole, setMyRole] = useState<StaffRole | null>(null);

  async function load() {
    const r = await fetch('/api/admin/staff', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error === 'forbidden' ? 'У вашей роли нет доступа к сотрудникам' : (d.error || 'Ошибка загрузки'));
      return;
    }
    setRows(d.staff || []);
    setError('');
  }

  useEffect(() => { load(); fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(d.ok)setMyRole(d.role);}).catch(()=>{}); }, []);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const form = new FormData(e.currentTarget);
    const r = await fetch('/api/admin/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password'), role: form.get('role') })
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Не удалось создать сотрудника'); return; }
    setNotice(`Сотрудник ${d.username} создан. При первом входе он подключит MFA.`);
    e.currentTarget.reset();
    load();
  }

  async function toggle(username: string, active: boolean) {
    setError('');
    const r = await fetch('/api/admin/staff', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, active })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Не удалось изменить доступ'); return; }
    load();
  }

  return <ControlShell title="Сотрудники" subtitle="RBAC, MFA и административный доступ">
    {error ? <div className="notice danger">{error}</div> : null}
    {notice ? <div className="notice success">{notice}</div> : null}
    {myRole && can(myRole,'staff_manage') ? <>
    <section className="panel staff-create">
      <div className="panel-title"><div><span className="panel-kicker">OWNER ONLY</span><h2>Добавить сотрудника</h2></div></div>
      <form onSubmit={add} className="staff-form">
        <label>Логин<input name="username" autoComplete="off" required /></label>
        <label>Временный пароль<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
        <label>Роль<select name="role" defaultValue="read_only">{STAFF_ROLES.filter(r => r !== 'owner').map(r => <option value={r} key={r}>{ROLE_LABELS[r]}</option>)}</select></label>
        <button className="primary" disabled={busy}>{busy ? 'Создаю…' : 'Создать'}</button>
      </form>
      <p className="muted staff-help">Пароль сразу хешируется через scrypt. TOTP-secret создаётся на сервере; сотрудник увидит QR только после правильного пароля при первом входе.</p>
    </section>
    </> : <div className="notice">У вашей роли есть только просмотр списка сотрудников.</div>}
    <section className="panel data-panel"><div className="table-wrap"><table className="data-table">
      <thead><tr><th>Логин</th><th>Роль</th><th>MFA / доступ</th><th>Последний вход</th><th>Создан</th><th>Действие</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.username}>
        <td>{row.username}</td><td>{ROLE_LABELS[row.role]}</td><td>{!row.mfaEnrolledAt ? 'Ожидает MFA' : row.active ? 'Активен' : 'Отключён'}</td>
        <td>{row.lastLoginAt || '—'}</td><td>{row.createdAt}</td>
        <td>{!row.mfaEnrolledAt ? <span className="muted">Первый вход</span> : <button className="table-action" onClick={() => toggle(row.username, !row.active)}>{row.active ? 'Отключить' : 'Включить'}</button>}</td>
      </tr>)}</tbody>
    </table></div></section>
  </ControlShell>;
}
