'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';

type Snapshot = {
  ok: boolean;
  generatedAt: string;
  backend: { ok: boolean; status: string; uptimeHours: number | null; errorRate: string | null };
  stats: Record<string, number | null>;
  limitations: string[];
};

const cards = [
  ['onlineNow', 'Онлайн сейчас', 'realtime'],
  ['usersTotal', 'Пользователей', 'всего'],
  ['approvedDrivers', 'Проверенных водителей', 'approved'],
  ['pendingModeration', 'На модерации', 'нужно проверить'],
  ['reviewsTotal', 'Отзывов', 'всего'],
  ['blacklistActive', 'Blacklist', 'активных'],
  ['telegramMentions', 'Telegram сигналы', 'последние записи'],
  ['serverErrorsTotal', 'Server 5xx', 'с запуска']
] as const;

export default function Dashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/snapshot', { cache: 'no-store' });
      if (r.status === 401) { router.replace('/login'); return; }
      const json = await r.json();
      setData(json);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, []);
  const generated = useMemo(() => data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', [data?.generatedAt]);

  return <ControlShell title="Обзор" subtitle="Операционная картина UrTruck в одном месте">
    <div className="toolbar"><div className={data?.backend.ok ? 'backend-pill ok' : 'backend-pill bad'}><span /> Backend: {data?.backend.status || (loading ? 'checking…' : 'unavailable')}</div><div className="muted">Обновлено {generated}</div><button className="refresh" onClick={load}>Обновить</button></div>
    <section className="metrics-grid">
      {cards.map(([key, label, hint]) => <article className="metric-card" key={key}><div className="metric-head"><span>{label}</span><em>{hint}</em></div><strong className={key === 'onlineNow' ? 'live-value' : ''}>{loading && !data ? '…' : data?.stats?.[key] ?? '—'}</strong>{key === 'onlineNow' && data?.stats?.onlineNow == null ? <small>Подключим heartbeat — пока не считаем приблизительно.</small> : null}</article>)}
    </section>
    <section className="split-grid">
      <article className="panel"><div className="panel-title"><div><span className="panel-kicker">SYSTEM</span><h2>Здоровье backend</h2></div><div className={data?.backend.ok ? 'status-chip ok' : 'status-chip danger'}>{data?.backend.ok ? 'Operational' : 'Attention'}</div></div><div className="detail-row"><span>Uptime</span><b>{data?.backend.uptimeHours ?? '—'} h</b></div><div className="detail-row"><span>Error rate</span><b>{data?.backend.errorRate ?? '—'}</b></div><div className="detail-row"><span>HTTP requests</span><b>{data?.stats?.requestsTotal ?? '—'}</b></div></article>
      <article className="panel"><div className="panel-title"><div><span className="panel-kicker">DATA CONTRACT</span><h2>Что ещё подключаем</h2></div></div><ul className="limitation-list">{(data?.limitations || ['Загрузка…']).map((item) => <li key={item}>{item}</li>)}</ul></article>
    </section>
    <section className="panel roadmap"><div className="panel-title"><div><span className="panel-kicker">NEXT CONTROL LAYER</span><h2>Операционные модули</h2></div></div><div className="roadmap-grid"><div><b>Presence</b><span>online, last_seen, роль, платформа, версия</span></div><div><b>Marketplace</b><span>грузы, рейсы, ставки, конверсия в сделку</span></div><div><b>Deal Room</b><span>статус, чат, документы, audit access</span></div><div><b>GPS</b><span>активные рейсы, свежесть точки, lost/restored</span></div></div></section>
  </ControlShell>;
}
