// Отсутствие телеметрии не означает нулевой прогресс или полный остаток.
export function routeMetricValues(summary, freshLocation) {
  const usable = summary && !summary.blocked ? summary : null;
  const live = Boolean(usable?.isRemaining && freshLocation);
  const progress = usable?.progressPercent;
  return {
    total: usable?.totalDistanceText || (!usable?.isRemaining && usable?.distanceText) || '—',
    remaining: live ? usable.distanceText || '—' : '—',
    estimatedTime: usable?.totalDurationText || (!usable?.isRemaining && usable?.durationText) || '—',
    // Дата доставки — обещанный срок. Подтверждённого ETA в контракте пока нет.
    eta: '—',
    passed: live ? usable.passedDistanceText || '—' : '—',
    progress: live && typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress)) : null,
  };
}
