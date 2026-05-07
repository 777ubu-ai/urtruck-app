// formatCooldown — превращает секунды rate-limit cooldown в человекочитаемый
// MM:SS / HH:MM:SS. Никаких сырых "1985 сек" в UI.
//
// Stage 40: общая утилита для PremiumRegister / PremiumLogin / PremiumOtp,
// чтобы текст cooldown оставался единым везде.
//
// Примеры:
//   formatCooldown(0)    → '00:00'
//   formatCooldown(59)   → '00:59'
//   formatCooldown(749)  → '12:29'
//   formatCooldown(1027) → '17:07'
//   formatCooldown(3661) → '01:01:01'

const pad = (n) => (n < 10 ? '0' + n : '' + n);

export function formatCooldown(secInput) {
  let sec = Math.max(0, Math.floor(Number(secInput) || 0));
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec - h * 3600) / 60);
    const s = sec - h * 3600 - m * 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${pad(m)}:${pad(s)}`;
}
