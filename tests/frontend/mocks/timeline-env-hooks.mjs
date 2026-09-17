// Resolve-хук для gray-box-рендера DealStatusTimeline.js: подменяет
// './DealRoom' на deal-room-stub.mjs (реальный DealRoom тянет нативный
// TruckMap, недоступный под plain Node). Всё остальное делегируется дальше
// по цепочке — в tests/frontend/loader.mjs + mocks/render-env-hooks.mjs,
// поэтому НЕ дублирует их маппинги.
const HERE = new URL('.', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === './DealRoom' || specifier.endsWith('/components/deal/DealRoom')) {
    return { url: `${HERE}deal-room-stub.mjs`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
