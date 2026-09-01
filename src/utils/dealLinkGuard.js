// P0 root-cause fix (2026-09-01, direct deeplink urtruck://deals/{id}).
//
// ДОКАЗАННАЯ первопричина зависания deal-access-guard у ЛЕГИТИМНЫХ участников:
// прежний guard (вариант D, PR #340) использовал как ПЕРВЫЙ оракул доступа
// самый тяжёлый эндпоинт приложения — GET /market/my (все сделки/ставки/
// грузы/рейсы юзера). На cold-start по deeplink дашборд-кеш (3 с) холодный,
// приложение одновременно шлёт burst запросов (Feed, BottomNav, appBadge
// force:true, push-регистрация, комнаты чата) — /market/my не укладывался в
// жёсткие 20 с authedFetch → AbortController → «[myDashboard] fetch error:
// Aborted» (подтверждено logcat на физическом OPPO). После abort guard
// ПОСЛЕДОВАТЕЛЬНО запускал fallback GET /deals/{id} — ещё до 20 с. Итог:
// 20–40 с голого спиннера, затем молчаливый kick на «Сделки» даже для
// победителя торга. Обычный вход Deals → «В работе» работал только потому,
// что DealsScreen сам только что прогрел 3-секундный dashboard-кеш и guard
// решался из кеша без сети.
//
// Гипотеза «navigation loop / вечный remount» ОПРОВЕРГНУТА кодом: linking
// config у NavigationContainer отсутствует вовсе — deeplink обрабатывается
// вручную (App.js routeFromUrl → одиночный navigate), восстановления Chat из
// linking-state после navigate('Deals') нет; deps guard-эффекта примитивные.
//
// Фикс: единственный и ПЕРВЫЙ оракул для явного dealId — лёгкий
// GET /market/deals/{id} (точечный SELECT по PK; сервер сам решает:
// участник → 200, чужой → 403, нет сделки → 404). Тяжёлый /market/my из
// пути deeplink исключён полностью. Ответ классифицируется в КОНЕЧНЫЕ
// состояния (никакого вечного спиннера):
//   ALLOWED     → workspace;
//   DENIED      → экран «Нет доступа к этой сделке» + кнопка «К сделкам»;
//   UNAVAILABLE → «Не удалось проверить доступ» + кнопка «Повторить»
//                 (сетевая ошибка/abort/5xx — retryable, fail closed).
//
// SECURITY INVARIANT прежний: dealId/roomId из deeplink/push/navigation —
// только идентификатор, НИКОГДА не доказательство членства. Оракул — сервер.
//
// Резолвер чистый и инжектируемый (api) — runtime-тесты гоняют его с моками
// без RN-рантайма: tests/frontend/test_deal_deeplink_guard_runtime.mjs.
import { marketAPI } from './marketAPI';
import { chatAPI } from './chatAPI';
import { DEAL_ACCESS, classifyDealAccess } from './dealAccess';

export const DEAL_LINK_VERIFYING = 'checking';

export async function resolveDealLinkAccess({ dealId = null, roomId = null, partnerId = null, api = null } = {}) {
  const startedAt = Date.now();
  const deps = api || {
    getDeal: (id) => marketAPI.getDeal(id),
    rooms: () => chatAPI.rooms(),
  };
  const done = (extra) => ({ durationMs: Date.now() - startedAt, ...extra });

  if (dealId) {
    try {
      const direct = await deps.getDeal(dealId);
      const state = classifyDealAccess(direct);
      if (state === DEAL_ACCESS.ALLOWED) {
        // Сравнение регистро-независимое: по RFC 4122 hex-цифры UUID
        // регистро-независимы, а сервер возвращает КАНОНИЧЕСКИЙ id из БД
        // (строчными). Строгое сравнение уводило бы UPPERCASE-deeplink в
        // UNAVAILABLE уже ПОСЛЕ успешной серверной проверки доступа.
        if (String(direct?.id || '').toLowerCase() !== String(dealId).toLowerCase()) {
          // 200, но сервер вернул ДРУГУЮ сделку — аномалия, fail closed
          // в retryable (не открывать workspace, не хоронить доступ навсегда).
          return done({ state: DEAL_ACCESS.UNAVAILABLE, source: 'direct-deal', status: 0 });
        }
        return done({
          state,
          source: 'direct-deal',
          dealId: direct.id,
          roomId: direct.chat_room_id || roomId || null,
          deal: direct,
        });
      }
      return done({ state, source: 'direct-deal', status: Number(direct?.status || 0) });
    } catch (error) {
      // AbortError (20 с authedFetch), сетевые сбои, не-JSON от прокси —
      // транзиент: retryable, НЕ denied (легитимного участника не выкидываем).
      return done({ state: DEAL_ACCESS.UNAVAILABLE, source: 'direct-deal', error: error?.name || 'error' });
    }
  }

  // roomId / partner-only входы по-прежнему разрешаются через серверный
  // список комнат ТЕКУЩЕГО пользователя — параметры сами по себе ничего
  // не доказывают, а pre-deal чат из профиля партнёра запрещён.
  try {
    const data = await deps.rooms();
    const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
    let room = null;
    if (roomId) {
      room = rooms.find((item) => String(item.id) === String(roomId)) || null;
    } else if (partnerId) {
      room = rooms.find((item) => item.deal_id && String(item.partner_id) === String(partnerId)) || null;
    }
    if (room?.deal_id) {
      return done({ state: DEAL_ACCESS.ALLOWED, source: 'rooms', dealId: room.deal_id, roomId: room.id, room });
    }
    return done({ state: DEAL_ACCESS.DENIED, source: 'rooms', status: 0 });
  } catch (error) {
    return done({ state: DEAL_ACCESS.UNAVAILABLE, source: 'rooms', error: error?.name || 'error' });
  }
}
