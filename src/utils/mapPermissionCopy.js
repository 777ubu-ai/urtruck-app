const COPY = {
  RU: {
    blocked: 'Для открытия карты рейса разрешите GPS-отслеживание.',
    retry: 'Разрешить GPS',
  },
  EN: {
    blocked: 'Allow GPS tracking to open the trip map.',
    retry: 'Allow GPS',
  },
  ZH: {
    blocked: '要打开运输地图，请允许 GPS 跟踪。',
    retry: '允许 GPS',
  },
  KK: {
    blocked: 'Рейс картасын ашу үшін GPS бақылауға рұқсат беріңіз.',
    retry: 'GPS рұқсат беру',
  },
};

export const getMapPermissionCopy = (lang) => COPY[lang] || COPY.EN;
export default COPY;
