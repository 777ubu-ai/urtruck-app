// Современная line-иконка типа кузова (MaterialCommunityIcons) вместо эмодзи.
// Единый стиль во всех пикерах (CreateCargo / CreateTrip / EditTrip).
// Имя глифа берётся из TRUCK_MCI; неизвестный тип → 'truck'.
import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { TRUCK_MCI } from '../utils/truckConstants';

export default function TruckTypeIcon({ type, size = 24, color = '#0A0A0A' }) {
  return (
    <MaterialCommunityIcons
      name={TRUCK_MCI[type] || 'truck'}
      size={size}
      color={color}
    />
  );
}
