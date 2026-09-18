'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import ControlShell from './ControlShell';
type Event={at?:string;actor?:string;role?:string;action?:string;target?:string;success?:boolean;ip?:string;detail?:string};
export default function AuditPage(){
 const router=useRouter();const [rows,setRows]=useState<Event[]>([]);const [error,setError]=useState('');
 async function load(){setError('');const r=await fetch('/api/admin/audit?limit=250',{cache:'no-store'});if(r.status===401){router.replace('/login');return;}const d=await r.json().catch(()=>({}));if(r.status===403){setError('У вашей роли нет доступа к журналу аудита');return;}if(!r.ok){setError(d.error||'Не удалось загрузить audit log');return;}setRows(d.events||[]);}
 useEffect(()=>{load();},[]);
 return <ControlShell title="Аудит" subtitle="Кто, когда и что открывал или изменял в Control Center"><div className="toolbar"><div className="backend-pill ok"><span/> Append-only log</div><div className="muted">{rows.length} событий</div><button className="refresh" onClick={load}>Обновить</button></div>{error?<div className="notice danger">{error}</div>:null}<section className="panel data-panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Время</th><th>Сотрудник</th><th>Роль</th><th>Действие</th><th>Объект</th><th>Результат</th><th>IP</th></tr></thead><tbody>{rows.map((x,i)=><tr key={`${x.at}-${i}`}><td>{x.at||'—'}</td><td>{x.actor||'—'}</td><td>{x.role||'—'}</td><td>{x.action||'—'}</td><td>{x.target||'—'}</td><td>{x.success===false?'DENIED':'OK'}</td><td>{x.ip||'—'}</td></tr>)}</tbody></table></div></section></ControlShell>;
}
