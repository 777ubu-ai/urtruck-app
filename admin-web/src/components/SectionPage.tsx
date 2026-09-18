'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';

export default function SectionPage({ title, subtitle, body }: { title: string; subtitle: string; body: string }) {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/admin/snapshot', { cache: 'no-store' }).then(r => { if (r.status === 401) router.replace('/login'); }).catch(() => {});
  }, [router]);
  return <ControlShell title={title} subtitle={subtitle}><section className="panel hero-empty"><span className="panel-kicker">CONTROL MODULE</span><h2>{title}</h2><p>{body}</p><div className="status-chip pending">API integration pending</div></section></ControlShell>;
}
