'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';

type State = Record<string, string | number | boolean | null>;

const LABELS: Record<string,string> = {
  environment:'Environment', release_sha:'Release SHA', server_time_utc:'Server time UTC',
  presence_available:'Redis presence', online:'Online', push_pending:'Push pending',
  push_dead:'Push dead', active_deals:'Активные сделки', gps_fresh:'GPS fresh', gps_stale:'GPS stale'
};

export default function SystemPage(){
  const router=useRouter(); const [data,setData]=useState<State>({}); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  async function load(){setLoading(true);setError('');try{const r=await fetch('/api/admin/control/system',{cache:'no-store'});if(r.status===401){router.replace('/login');return;}if(r.status===403){setError('У вашей роли нет доступа к системному разделу');return;}const d=await r.json();if(!r.ok){setError(d.error||'Backend недоступен');return;}delete d.ok;setData(d);}catch{setError('Backend недоступен');}finally{setLoading(false);}}
  useEffect(()=>{load();const id=setInterval(load,30_000);return()=>clearInterval(id);},[]);
  return <ControlShell title="Система" subtitle="Backend, push, GPS и release state">
    <div className="toolbar"><div className="backend-pill ok"><span/> Operational</div><button className="refresh" onClick={load}>Обновить</button></div>
    {error?<div className="notice danger">{error}</div>:null}
    <section className="metrics-grid">{Object.entries(LABELS).map(([key,label])=><article className="metric-card" key={key}><div className="metric-head"><span>{label}</span><em>SYSTEM</em></div><strong>{loading&&!(key in data)?'…':String(data[key]??'—')}</strong></article>)}</section>
  </ControlShell>;
}
