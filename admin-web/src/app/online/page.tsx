import DataPage from '@/components/DataPage';
export default function Page() { return <DataPage title="Онлайн" subtitle="Реальные heartbeat за последние 90 секунд" endpoint="/api/admin/control/online" dataKey="users" emptyText="Сейчас нет подтверждённых online-сессий или presence ещё не подключён." columns={[
  { key:'user_id', label:'User ID' }, { key:'role', label:'Роль' }, { key:'platform', label:'Платформа' }, { key:'app_version', label:'Версия' }, { key:'screen', label:'Экран' }, { key:'locale', label:'Язык' }, { key:'last_seen', label:'Последний heartbeat' }
]} />; }
