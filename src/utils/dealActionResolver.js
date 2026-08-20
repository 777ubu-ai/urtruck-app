import { canonicalDealStatus } from './dealStatusOrder';

const translated = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : null;
  return value && value !== key ? value : fallback;
};

export function getAvailableDealActions({ role, status, isInternational, t }) {
  const current = canonicalDealStatus(status);
  const isDriver = role === 'driver';
  const isShipper = role === 'client' || role === 'shipper';

  if (isDriver) {
    if (current === 'accepted') {
      return [{ key: 'in_progress', label: translated(t, 'start_delivery', 'Начать рейс'), icon: 'truck', disabled: false }];
    }
    if (current === 'in_progress' && isInternational === true) {
      return [{ key: 'at_border', label: translated(t, 'mark_at_border', 'На границе'), icon: 'map-pin', disabled: false }];
    }
    if (current === 'in_progress' && isInternational == null) {
      return [{ key: 'clarify', label: translated(t, 'deal_clarify_route', 'Уточнить маршрут'), icon: 'alert-circle', disabled: true }];
    }
    if (current === 'in_progress' || current === 'at_border') {
      return [{ key: 'delivered', label: translated(t, 'mark_arrived', 'Груз доставлен'), icon: 'package', disabled: false }];
    }
    return [];
  }

  if (isShipper && current === 'delivered') {
    return [{ key: 'received', label: translated(t, 'confirm_delivery', 'Подтвердить получение'), icon: 'check-circle', disabled: false }];
  }
  if (isShipper && current === 'received') {
    return [{ key: 'completed', label: translated(t, 'complete_deal', 'Завершить сделку'), icon: 'check', disabled: false }];
  }
  return [];
}
