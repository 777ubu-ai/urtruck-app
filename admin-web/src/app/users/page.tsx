import DataPage from '@/components/DataPage';
export default function Page() { return <DataPage title="Пользователи" subtitle="Водители и грузоотправители — без гостевых сессий" endpoint="/api/admin/control/users" dataKey="users" emptyText="Пользователи не найдены." columns={[
  { key:'full_name', label:'Имя' }, { key:'role', label:'Роль' }, { key:'phone_masked', label:'Телефон' }, { key:'status', label:'Статус' }, { key:'verification_level', label:'Уровень' }, { key:'basic_onboarding_completed', label:'Онбординг', format:'boolean' }, { key:'updated_at', label:'Обновлён' }
]} />; }
