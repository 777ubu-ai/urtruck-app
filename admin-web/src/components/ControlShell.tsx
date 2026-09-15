'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { can, type Permission, type StaffRole } from '@/lib/rbac';

const NAV: readonly [string, string, Permission][] = [
  ['/', 'Обзор', 'dashboard'], ['/online', 'Онлайн', 'online'], ['/users', 'Пользователи', 'users'],
  ['/deals', 'Сделки', 'deals'], ['/chats', 'Чаты', 'chats'], ['/system', 'Система', 'system'], ['/staff', 'Сотрудники', 'staff_read']
];

type Me = { username: string; role: StaffRole; roleLabel: string };

export default function ControlShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const pathname = usePathname(); const router = useRouter(); const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { fetch('/api/auth/me', { cache:'no-store' }).then(async r => { if (r.status===401) { router.replace('/login'); return; } const d=await r.json(); if(d.ok) setMe(d); }).catch(()=>{}); }, [router]);
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); }
  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><div className="brand-mark">U</div><div><strong>UrTruck</strong><span>CONTROL CENTER</span></div></div>
    <nav className="nav-list">{NAV.filter(([, , permission]) => !me || can(me.role, permission)).map(([href,label]) => <Link key={href} href={href} className={pathname===href?'nav-item active':'nav-item'}>{label}</Link>)}</nav>
    <div className="sidebar-foot"><div className="live-dot-row"><i /> Production control</div>{me ? <div className="operator-card"><b>{me.username}</b><span>{me.roleLabel}</span></div> : null}<button className="logout" onClick={logout}>Выйти</button></div>
  </aside><main className="content"><header className="topbar"><div><p className="eyebrow">ADMIN.URTRUCK.KZ</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="top-status"><span className="pulse" /> LIVE</div></header>{children}</main></div>;
}
