import DataPage from '@/components/DataPage';
export default function Page() { return <DataPage title="Чаты" subtitle="Метаданные Deal Room; текст переписки скрыт по умолчанию" endpoint="/api/admin/control/chats" dataKey="chats" emptyText="Чаты не найдены." columns={[
  { key:'id', label:'Room' }, { key:'participant_1', label:'Участник 1' }, { key:'participant_2', label:'Участник 2' }, { key:'cargo_id', label:'Груз' }, { key:'message_count', label:'Сообщения' }, { key:'voice_count', label:'Голосовые' }, { key:'last_at', label:'Последняя активность' }
]} />; }
