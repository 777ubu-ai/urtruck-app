// Длина полилинии после упрощения может отличаться от длины дороги.
// Переносим долю пройденной геометрии на единую provider distance_m,
// чтобы total = passed + remaining и оба клиента показывали одно и то же.
export function routeMetricNumbers(route, progress) {
  const positive = value => value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const totalMeters = positive(route?.distance_m) ?? positive(progress?.totalMeters);
  const totalDurationSeconds = positive(route?.duration_s);
  const drivingDurationSeconds = positive(route?.driving_duration_s);
  const live = Boolean(progress?.matched && totalMeters && progress.totalMeters > 0);
  const fraction = live ? Math.max(0, Math.min(1, progress.passedMeters / progress.totalMeters)) : null;
  return {
    totalMeters, totalDurationSeconds, drivingDurationSeconds,
    passedMeters: live ? totalMeters * fraction : null,
    remainingMeters: live ? totalMeters * (1 - fraction) : null,
    progressPercent: live ? progress.progressPercent : null,
    isRemaining: live,
  };
}
