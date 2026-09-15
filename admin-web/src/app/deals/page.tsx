import DataPage from '@/components/DataPage';
export default function Page() { return <DataPage title="Сделки" subtitle="FSM, маршрут и свежесть GPS — read-only" endpoint="/api/admin/control/deals" dataKey="deals" emptyText="Сделки не найдены." columns={[
  { key:'id', label:'Сделка' }, { key:'status', label:'Статус' }, { key:'from_city', label:'Откуда' }, { key:'to_city', label:'Куда' }, { key:'amount', label:'Сумма' }, { key:'driver_id', label:'Водитель' }, { key:'shipper_id', label:'Грузоотправитель' }, { key:'gps_updated_at', label:'GPS обновлён' }
]} />; }
