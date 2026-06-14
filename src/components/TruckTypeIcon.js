// Иконка типа кузова — растровый набор владельца (assets/truck-icons/*.png),
// единый стиль «грузовик сбоку», нарезан из присланного листа (14.06).
// Рисуется на белой карточке (см. TruckTypeGrid), поэтому фон иконки белый.
import React from 'react';
import { Image } from 'react-native';

// Статичные require — Metro требует литералы (динамический путь не соберётся).
const IMG = {
  tent: require('../../assets/truck-icons/tent.png'),
  ref: require('../../assets/truck-icons/ref.png'),
  platform: require('../../assets/truck-icons/platform.png'),
  auto: require('../../assets/truck-icons/auto.png'),
  izoterm: require('../../assets/truck-icons/izoterm.png'),
  cont20: require('../../assets/truck-icons/cont20.png'),
  cont40: require('../../assets/truck-icons/cont40.png'),
  jumbo: require('../../assets/truck-icons/jumbo.png'),
  mega: require('../../assets/truck-icons/mega.png'),
  curtain: require('../../assets/truck-icons/curtain.png'),
  lowloader: require('../../assets/truck-icons/lowloader.png'),
  tanker: require('../../assets/truck-icons/tanker.png'),
  dumptruck: require('../../assets/truck-icons/dumptruck.png'),
  grain: require('../../assets/truck-icons/grain.png'),
  livestock: require('../../assets/truck-icons/livestock.png'),
  logger: require('../../assets/truck-icons/logger.png'),
  hazmat: require('../../assets/truck-icons/hazmat.png'),
  open_truck: require('../../assets/truck-icons/open_truck.png'),
  closed: require('../../assets/truck-icons/closed.png'),
  longliner: require('../../assets/truck-icons/longliner.png'),
  microvan: require('../../assets/truck-icons/microvan.png'),
};

export default function TruckTypeIcon({ type, width = 62 }) {
  return (
    <Image
      source={IMG[type] || IMG.tent}
      style={{ width, height: width * 0.66 }}
      resizeMode="contain"
    />
  );
}
