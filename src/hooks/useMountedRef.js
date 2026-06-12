import { useEffect, useRef } from 'react';

// QA-аудит P1-8: общий флаг «компонент ещё смонтирован» — защита от
// setState после unmount (RN-warning + лишняя работа) в async-загрузках
// и поллингах. Применять точечно перед setState в async-путях:
//
//   const mounted = useMountedRef();
//   const d = await api();
//   if (!mounted.current) return;   // экран уже размонтирован — выходим
//   setData(d);
//
// Начальное значение true покрывает окно «до первого эффекта»; cleanup
// ставит false на unmount (и корректно отрабатывает StrictMode-повтор).
export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

export default useMountedRef;
