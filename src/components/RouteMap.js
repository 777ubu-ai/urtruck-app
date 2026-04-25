import React from 'react';
import { View, Text, StyleSheet, Platform, Linking, TouchableOpacity } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';

// Координаты основных городов [lat, lon]
const CITIES = {
  // Казахстан
  'Алматы': [43.2220, 76.8512], 'Almaty': [43.2220, 76.8512],
  'Астана': [51.1694, 71.4491], 'Astana': [51.1694, 71.4491], 'Нур-Султан': [51.1694, 71.4491],
  'Шымкент': [42.3417, 69.5901], 'Караганда': [49.8047, 73.1094],
  'Актобе': [50.2839, 57.1660], 'Атырау': [47.0945, 51.9238],
  'Усть-Каменогорск': [49.9787, 82.6086], 'Павлодар': [52.2871, 76.9669],
  'Семей': [50.4111, 80.2275], 'Тараз': [42.9000, 71.3667],
  'Костанай': [53.2189, 63.6356], 'Кызылорда': [44.8488, 65.4823],
  'Уральск': [51.2333, 51.3667], 'Актау': [43.6500, 51.1800],
  'Петропавловск': [54.8650, 69.1500], 'Кокшетау': [53.2833, 69.3833],
  'Хоргос': [44.2113, 80.4137],
  // Россия
  'Москва': [55.7558, 37.6176], 'Moscow': [55.7558, 37.6176],
  'Санкт-Петербург': [59.9311, 30.3609], 'СПб': [59.9311, 30.3609],
  'Новосибирск': [55.0084, 82.9357], 'Екатеринбург': [56.8431, 60.6454],
  'Казань': [55.8304, 49.0661], 'Нижний Новгород': [56.2965, 43.9361],
  'Челябинск': [55.1644, 61.4368], 'Самара': [53.2415, 50.2212],
  'Омск': [54.9885, 73.3242], 'Уфа': [54.7388, 55.9721],
  'Красноярск': [56.0153, 92.8932], 'Воронеж': [51.6720, 39.1843],
  'Волгоград': [48.7194, 44.5018], 'Ростов-на-Дону': [47.2357, 39.7015],
  'Краснодар': [45.0355, 38.9753], 'Иркутск': [52.2864, 104.2807],
  'Владивосток': [43.1198, 131.8869], 'Хабаровск': [48.4827, 135.0838],
  // Китай
  'Иу': [29.3079, 120.0762], 'Yiwu': [29.3079, 120.0762],
  'Гуанчжоу': [23.1291, 113.2644], 'Guangzhou': [23.1291, 113.2644],
  'Шэньчжэнь': [22.5431, 114.0579], 'Shenzhen': [22.5431, 114.0579],
  'Пекин': [39.9042, 116.4074], 'Beijing': [39.9042, 116.4074],
  'Шанхай': [31.2304, 121.4737], 'Ханчжоу': [30.2741, 120.1551],
  'Урумчи': [43.8256, 87.6168], 'Циндао': [36.0671, 120.3826],
  'Чэнду': [30.5728, 104.0668], 'Чунцин': [29.4316, 106.9123],
  'Тяньцзинь': [39.3434, 117.3616],
  // Узбекистан
  'Ташкент': [41.2995, 69.2401], 'Tashkent': [41.2995, 69.2401],
  'Самарканд': [39.6542, 66.9597], 'Бухара': [39.7747, 64.4286],
  'Андижан': [40.7821, 72.3442], 'Наманган': [40.9983, 71.6726],
  'Фергана': [40.3842, 71.7843], 'Нукус': [42.4531, 59.6103],
  // Кыргызстан
  'Бишкек': [42.8746, 74.5698], 'Bishkek': [42.8746, 74.5698],
  'Ош': [40.5283, 72.7985], 'Каракол': [42.4905, 78.3937],
  // Таджикистан, Туркменистан
  'Душанбе': [38.5598, 68.7870], 'Худжанд': [40.2828, 69.6219],
  'Ашхабад': [37.9601, 58.3261],
  // Грузия, Армения, Азербайджан
  'Тбилиси': [41.7151, 44.8271], 'Батуми': [41.6168, 41.6367],
  'Ереван': [40.1792, 44.4991], 'Баку': [40.4093, 49.8671],
  // Беларусь
  'Минск': [53.9006, 27.5590], 'Брест': [52.0975, 23.7340],
  // Турция
  'Стамбул': [41.0082, 28.9784], 'Анкара': [39.9334, 32.8597],
  'Измир': [38.4192, 27.1287],
  // Германия, Польша
  'Гамбург': [53.5511, 9.9937], 'Hamburg': [53.5511, 9.9937],
  'Берлин': [52.5200, 13.4050], 'Мюнхен': [48.1351, 11.5820],
  'Франкфурт': [50.1109, 8.6821], 'Варшава': [52.2297, 21.0122],
  'Гданьск': [54.3520, 18.6466],
  // ОАЭ
  'Дубай': [25.2048, 55.2708],
};

const parseCity = (str) => {
  if (!str) return null;
  // Разбиваем "Москва, RU" или "Москва, 🇷🇺"
  const name = str.split(',')[0].trim();
  return CITIES[name] || null;
};

export default function RouteMap({ from, to, transit, liveCoord, height = 200 }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const fromCoord = parseCity(from);
  const toCoord = parseCity(to);

  // Открыть в Яндекс.Картах с маршрутом для грузовика
  const openYandex = () => {
    if (!fromCoord || !toCoord) {
      const q = encodeURIComponent((from || '') + ' → ' + (to || ''));
      Linking.openURL(`https://yandex.com/maps/?text=${q}`);
      return;
    }
    // rtt=auto — авто-маршрут (Яндекс не имеет специального для грузовиков в публичном API)
    let url = `https://yandex.com/maps/?rtext=${fromCoord[0]},${fromCoord[1]}~`;
    if (transit) {
      const tCoord = parseCity(transit);
      if (tCoord) url += `${tCoord[0]},${tCoord[1]}~`;
    }
    url += `${toCoord[0]},${toCoord[1]}&rtt=auto`;
    Linking.openURL(url);
  };

  // Web: встраиваем Яндекс.Карты через map-widget (без API key)
  if (Platform.OS === 'web' && fromCoord && toCoord) {
    // Центрируем на середине маршрута
    const centerLat = (fromCoord[0] + toCoord[0]) / 2;
    const centerLon = (fromCoord[1] + toCoord[1]) / 2;
    // Зум зависит от расстояния
    const dLat = Math.abs(fromCoord[0] - toCoord[0]);
    const dLon = Math.abs(fromCoord[1] - toCoord[1]);
    const maxD = Math.max(dLat, dLon);
    let zoom = 4;
    if (maxD < 1) zoom = 9;
    else if (maxD < 3) zoom = 7;
    else if (maxD < 8) zoom = 6;
    else if (maxD < 20) zoom = 5;
    else if (maxD < 50) zoom = 4;
    else zoom = 3;

    // Маркеры: pm2rdm = red dot middle, pm2gnm = green, pm2vvm = violet (live truck)
    let pts = `${fromCoord[1]},${fromCoord[0]},pm2rdm~${toCoord[1]},${toCoord[0]},pm2gnm`;
    if (transit) {
      const tCoord = parseCity(transit);
      if (tCoord) pts = `${fromCoord[1]},${fromCoord[0]},pm2rdm~${tCoord[1]},${tCoord[0]},pm2blm~${toCoord[1]},${toCoord[0]},pm2gnm`;
    }
    if (liveCoord) {
      pts += `~${liveCoord[1]},${liveCoord[0]},pm2vvm`;
    }
    const src = `https://yandex.com/map-widget/v1/?ll=${centerLon},${centerLat}&z=${zoom}&pt=${pts}&lang=ru_RU`;

    return (
      <View style={[s.wrap, { borderColor: theme.border, height }]}>
        <iframe
          src={src}
          style={{ border: 0, width: '100%', height, borderRadius: 12, display: 'block' }}
          title="Yandex Map"
          allowFullScreen
        />
        <TouchableOpacity style={[s.openBtn, { backgroundColor: 'rgba(255,204,0,0.95)' }]} onPress={openYandex}>
          <Text style={s.openBtnText}>📍 Открыть в Яндекс</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Mobile или нет координат — placeholder с открытием Яндекс.Навигатора
  return (
    <TouchableOpacity style={[s.placeholder, { backgroundColor: theme.border, height }]} onPress={openYandex}>
      <Text style={{ fontSize: 32 }}>🗺️</Text>
      <Text style={[s.placeholderText, { color: theme.textSecondary }]}>{from} → {to}</Text>
      <View style={s.placeholderBtn}>
        <Text style={s.placeholderBtnText}>📍 Яндекс.Карты</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', borderWidth: 1, marginBottom: 12 },
  openBtn: {
    position: 'absolute', bottom: 8, right: 8,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  openBtnText: { fontSize: 11, fontWeight: '800', color: '#000' },
  placeholder: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, padding: 20 },
  placeholderText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  placeholderBtn: { backgroundColor: '#FFCC00', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
  placeholderBtnText: { color: '#000', fontSize: 12, fontWeight: '800' },
});
