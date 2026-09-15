'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';

type Column = { key: string; label: string; format?: 'boolean' };

function formatCell(column: Column, raw: unknown): string {
  if (column.format === 'boolean') return Number(raw) === 1 ? 'Да' : 'Нет';
  return raw == null || raw === '' ? '—' : String(raw);
}

export default function DataPage({ title, subtitle, endpoint, dataKey, columns, emptyText }: {
  title: string; subtitle: string; endpoint: string; dataKey: string; columns: Column[]; emptyText: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (r.status === 401) { router.replace('/login'); return; }
      if (r.status === 403) { setError('У вашей роли нет доступа к этому разделу'); return; }
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Не удалось получить данные'); return; }
      const list = Array.isArray(data[dataKey]) ? data[dataKey] : [];
      setRows(list);
      const rest = { ...data }; delete rest[dataKey]; delete rest.ok;
      setMeta(rest);
    } catch { setError('Backend недоступен'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, []);
  const metaText = useMemo(() => Object.entries(meta).filter(([,v]) => ['string','number','boolean'].includes(typeof v)).map(([k,v]) => `${k}: ${String(v)}`).join(' · '), [meta]);

  return <ControlShell title={title} subtitle={subtitle}>
    <div className="toolbar"><div className="backend-pill ok"><span /> Read-only</div><div className="muted">{metaText || `${rows.length} записей`}</div><button className="refresh" onClick={load}>Обновить</button></div>
    <section className="panel data-panel">
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
        {!loading && rows.length === 0 ? <tr><td colSpan={columns.length} className="empty-cell">{emptyText}</td></tr> : null}
        {rows.map((row, idx) => <tr key={String(row.id || row.user_id || idx)}>{columns.map(c => { const raw = row[c.key]; const text = formatCell(c, raw); return <td key={c.key} title={text}>{text}</td>; })}</tr>)}
        {loading && rows.length === 0 ? <tr><td colSpan={columns.length} className="empty-cell">Загрузка…</td></tr> : null}
      </tbody></table></div>
    </section>
  </ControlShell>;
}
