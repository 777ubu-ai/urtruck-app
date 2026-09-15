'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';

type Snapshot = { generatedAt:string; backend:{ok:boolean;status:string}; stats:Record<string,number|null>; presence:{available:boolean;by_role:Record<string,number>;by_platform:Record<string,number>}; limitations:string[] };
const cards = [
  ['onlineNow','Онлайн сейчас','90 сек'], ['users_total','Пользователей','driver + shipper'], ['users_today','Новых сегодня','регистрации'], ['cargos_active','Активных грузов','marketplace'],
  ['bids_today','Предложений сегодня','bids'], ['deals_active','Сделок в работе','FSM'], ['messages_today','Сообщений сегодня','chat'], ['gps_active','GPS online','≤ 20 мин'],
  ['pending_moderation','На модерации','требует проверки'], ['push_pending','Push очередь','pending'], ['push_dead','Push dead','ошибки'], ['voice_today','Голосовых сегодня','voice']
] as const;

export default function Dashboard() {
  const [data,setData]=useState<Snapshot|null>(null); const [loading,setLoading]=useState(true); const router=useRouter();
  async function load(){ setLoading(true); try { const r=await fetch('/api/admin/snapshot',{cache:'no-store'}); if(r.status===401){router.replace('/login');return;} setData(await r.json()); } finally { setLoading(false); } }
  useEffect(()=>{load();const id=setInterval(load,30_000);return()=>clearInterval(id);},[]);
  const generated=useMemo(()=>data?.generatedAt?new Date(data.generatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—',[data?.generatedAt]);
  return <ControlShell title="Обзор" subtitle="Живая операционная картина UrTruck">
    <div className="toolbar"><div className={data?.backend.ok?'backend-pill ok':'backend-pill bad'}><span/> Backend: {data?.backend.status || (loading?'checking…':'unavailable')}</div><div className="muted">Обновлено {generated}</div><button className="refresh" onClick={load}>Обновить</button></div>
    <section className="metrics-grid">{cards.map(([key,label,hint])=><article className="metric-card" key={key}><div className="metric-head"><span>{label}</span><em>{hint}</em></div><strong className={key==='onlineNow'?'live-value':''}>{loading&&!data?'…':data?.stats?.[key]??'—'}</strong>{key==='onlineNow'&&!data?.presence?.available?<small>Без heartbeat цифру не выдумываем.</small>:null}</article>)}</section>
    <section className="split-grid"><article className="panel"><div className="panel-title"><div><span className="panel-kicker">PRESENCE</span><h2>Кто сейчас в UrTruck</h2></div><div className={data?.presence?.available?'status-chip ok':'status-chip danger'}>{data?.presence?.available?'Live':'Unavailable'}</div></div><div className="detail-row"><span>Водители</span><b>{data?.presence?.by_role?.driver??'—'}</b></div><div className="detail-row"><span>Грузоотправители</span><b>{data?.presence?.by_role?.client??'—'}</b></div><div className="detail-row"><span>Android / iOS / Web</span><b>{[data?.presence?.by_platform?.android??0,data?.presence?.by_platform?.ios??0,data?.presence?.by_platform?.web??0].join(' / ')}</b></div></article>
    <article className="panel"><div className="panel-title"><div><span className="panel-kicker">GUARDS</span><h2>Правила Control Center</h2></div></div><ul className="limitation-list">{(data?.limitations||['Загрузка…']).map(x=><li key={x}>{x}</li>)}</ul></article></section>
    <section className="panel roadmap"><div className="panel-title"><div><span className="panel-kicker">OPERATIONS</span><h2>Контроль ключевых подсистем</h2></div></div><div className="roadmap-grid"><div><b>Marketplace</b><span>грузы, ставки, сделки</span></div><div><b>Deal Room</b><span>активность чатов без скрытого чтения текста</span></div><div><b>GPS</b><span>свежие и потерянные точки</span></div><div><b>Push</b><span>очередь и dead-letter</span></div></div></section>
  </ControlShell>;
}
