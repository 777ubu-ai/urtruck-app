'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [setupQr, setSetupQr] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json().catch(() => ({}));
        if (data.ok) { router.replace('/'); router.refresh(); }
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password'), otp: form.get('otp') })
    });
    const data = await r.json().catch(() => ({})); setBusy(false);
    if (data.mfaSetupRequired) { setSetupQr(data.qrDataUrl || ''); return; }
    if (data.mfaRequired) { setMfaRequired(true); return; }
    if (!r.ok) { setError(data.error || 'Вход не выполнен'); return; }
    router.replace('/'); router.refresh();
  }

  async function enroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    const r = await fetch('/api/auth/enroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: form.get('otp') })
    });
    const data = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setError(data.error || 'MFA не активирован'); return; }
    router.replace('/'); router.refresh();
  }

  return <main className="login-wrap"><div className="login-grid-bg" /><section className="login-card">
    <div className="brand login-brand"><div className="brand-mark">U</div><div><strong>UrTruck</strong><span>CONTROL CENTER</span></div></div>
    <p className="eyebrow">SECURE OPERATOR ACCESS</p><h1>Управление UrTruck</h1>
    <p className="subtitle">Вход для сотрудников UrTruck. Временно используется логин и пароль.</p>
    {setupQr ? <form onSubmit={enroll}>
      <div className="mfa-setup"><b>Подключите двухфакторную защиту</b><p>Отсканируйте QR в Google Authenticator, Microsoft Authenticator или 1Password. Затем введите 6-значный код.</p><Image src={setupQr} alt="UrTruck MFA QR" width={220} height={220} unoptimized /></div>
      <label>Код Authenticator<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label>
      {error ? <div className="login-error">{error}</div> : null}<button className="primary" disabled={busy}>{busy ? 'Проверяю…' : 'Активировать MFA и войти'}</button>
    </form> : <form onSubmit={submit}>
      <label>Логин<input name="username" autoComplete="username" required /></label>
      <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
      {mfaRequired ? <label>Код Authenticator<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label> : null}
      {error ? <div className="login-error">{error}</div> : null}<button className="primary" disabled={busy}>{busy ? 'Проверяю…' : (mfaRequired ? 'Подтвердить и войти' : 'Продолжить')}</button>
    </form>}
    <small className="security-note">Сессия хранится в HttpOnly cookie. Пароль и TOTP-secret в браузере не сохраняются.</small>
  </section></main>;
}
