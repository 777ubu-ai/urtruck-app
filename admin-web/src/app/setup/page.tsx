'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage(){
  const router=useRouter(); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [qr,setQr]=useState('');
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setError(''); const f=new FormData(e.currentTarget); const p=String(f.get('password')||''); const c=String(f.get('confirm')||'');
    if(p!==c){setError('Пароли не совпадают');return;} setBusy(true);
    const r=await fetch('/api/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})}); const d=await r.json().catch(()=>({})); setBusy(false);
    if(!r.ok){setError(d.error||'Первичная настройка недоступна');return;} setQr(d.qrDataUrl||'');
  }
  async function enroll(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setError(''); setBusy(true); const f=new FormData(e.currentTarget);
    const r=await fetch('/api/auth/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otp:f.get('otp')})}); const d=await r.json().catch(()=>({})); setBusy(false);
    if(!r.ok){setError(d.error||'Код не принят');return;} router.replace('/'); router.refresh();
  }
  return <main className="login-wrap"><div className="login-grid-bg"/><section className="login-card">
    <div className="brand login-brand"><div className="brand-mark">U</div><div><strong>UrTruck</strong><span>CONTROL CENTER</span></div></div>
    <p className="eyebrow">FIRST OWNER SETUP</p><h1>Первый вход</h1>
    {!qr ? <form onSubmit={create}><p className="subtitle">Логин уже задан: <b>admin</b>. Придумайте свой новый пароль Owner.</p>
      <label>Новый пароль<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label>
      <label>Повторите пароль<input name="confirm" type="password" minLength={12} autoComplete="new-password" required/></label>
      {error?<div className="login-error">{error}</div>:null}<button className="primary" disabled={busy}>{busy?'Создаю…':'Создать Owner'}</button></form>
    : <form onSubmit={enroll}><div className="mfa-setup"><b>Теперь подключите Authenticator</b><p>1. Откройте Google/Microsoft Authenticator или 1Password.<br/>2. Отсканируйте QR.<br/>3. Введите появившиеся 6 цифр.</p><Image src={qr} alt="UrTruck MFA QR" width={220} height={220} unoptimized/></div>
      <label>6-значный код<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus/></label>
      {error?<div className="login-error">{error}</div>:null}<button className="primary" disabled={busy}>{busy?'Проверяю…':'Активировать и войти'}</button></form>}
  </section></main>;
}
