'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  ['/', 'Обзор'],
  ['/online', 'Онлайн'],
  ['/users', 'Пользователи'],
  ['/deals', 'Сделки'],
  ['/chats', 'Чаты'],
  ['/system', 'Система']
] as const;

export default function ControlShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">U</div><div><strong>UrTruck</strong><span>CONTROL CENTER</span></div></div>
        <nav className="nav-list">
          {NAV.map(([href, label]) => <Link key={href} href={href} className={pathname === href ? 'nav-item active' : 'nav-item'}>{label}</Link>)}
        </nav>
        <div className="sidebar-foot"><div className="live-dot-row"><i /> Production control</div><button className="logout" onClick={logout}>Выйти</button></div>
      </aside>
      <main className="content">
        <header className="topbar"><div><p className="eyebrow">ADMIN.URTRUCK.KZ</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="top-status"><span className="pulse" /> LIVE</div></header>
        {children}
      </main>
    </div>
  );
}
