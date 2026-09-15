'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(data.error || 'Вход не выполнен'); return; }
    router.replace('/'); router.refresh();
  }
  return <main className="login-wrap"><div className="login-grid-bg" /><section className="login-card"><div className="brand login-brand"><div className="brand-mark">U</div><div><strong>UrTruck</strong><span>CONTROL CENTER</span></div></div><p className="eyebrow">SECURE OPERATOR ACCESS</p><h1>Управление UrTruck</h1><p className="subtitle">Вход только для сотрудников с административным доступом.</p><form onSubmit={submit}><label>Логин<input name="username" autoComplete="username" required /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>{error ? <div className="login-error">{error}</div> : null}<button className="primary" disabled={busy}>{busy ? 'Проверяю…' : 'Войти в Control Center'}</button></form><small className="security-note">Сессия хранится только в HttpOnly cookie. Пароль не сохраняется в браузере.</small></section></main>;
}
