// Line-иконки типов кузова в едином стиле «тягач сбоку + свой кузов» —
// замена эмодзи (замечание владельца 13.06, референс-скрин). Рисуются
// примитивами react-native-svg, перекрашиваются под выделение (prop color),
// чёткие на любом размере. viewBox 0 0 64 40.
import React from 'react';
import Svg, { Path, Rect, Circle, Line, Polygon, Polyline } from 'react-native-svg';

// Общий низ: рама + два колеса + кабина слева.
function Chassis({ c, sw }) {
  return (
    <>
      <Line x1={3} y1={29} x2={61} y2={29} stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M4 29 L4 19 L10 19 L14 23 L14 29" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={11} cy={31} r={3.3} stroke={c} strokeWidth={sw} fill="none" />
      <Circle cx={50} cy={31} r={3.3} stroke={c} strokeWidth={sw} fill="none" />
    </>
  );
}

// Тело кузова по типу (область x≈16..60, y≈11..29).
function Body({ type, c, sw }) {
  const box = (x = 16, y = 13) => (
    <Rect x={x} y={y} width={59 - x} height={29 - y} rx={1.2} stroke={c} strokeWidth={sw} fill="none" />
  );
  const vlines = (xs, y1 = 14, y2 = 28) =>
    xs.map((x) => <Line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke={c} strokeWidth={sw * 0.8} />);
  switch (type) {
    case 'tent':
    case 'curtain':
    case 'jumbo':
    case 'mega':
    case 'longliner':
      // Тент/шторный: коробка с вертикальными рёбрами.
      return (<>{box()}{vlines([26, 35, 44])}</>);
    case 'ref':
      // Рефрижератор: коробка + снежинка.
      return (
        <>
          {box()}
          <Line x1={37} y1={17} x2={37} y2={25} stroke={c} strokeWidth={sw * 0.8} />
          <Line x1={33} y1={21} x2={41} y2={21} stroke={c} strokeWidth={sw * 0.8} />
          <Line x1={34} y1={18} x2={40} y2={24} stroke={c} strokeWidth={sw * 0.8} />
          <Line x1={40} y1={18} x2={34} y2={24} stroke={c} strokeWidth={sw * 0.8} />
        </>
      );
    case 'izoterm':
      // Изотерм: коробка + двойная стенка (линия внутри).
      return (<>{box()}<Line x1={16} y1={16} x2={59} y2={16} stroke={c} strokeWidth={sw * 0.7} /></>);
    case 'cont20':
      // Контейнер 20': короткая коробка с гофром.
      return (<>{box(24)}{vlines([30, 36, 42, 48, 54], 14, 28)}</>);
    case 'cont40':
      // Контейнер 40': длинная коробка с гофром.
      return (<>{box(16)}{vlines([22, 28, 34, 40, 46, 52], 14, 28)}</>);
    case 'platform':
    case 'open_truck':
      // Площадка / открытый борт: низкий борт.
      return (<Rect x={16} y={23} width={43} height={6} rx={1} stroke={c} strokeWidth={sw} fill="none" />);
    case 'lowloader':
      // Трал: низкорамник со ступенькой.
      return (<Polyline points="16,20 28,20 33,27 59,27" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" strokeLinecap="round" />);
    case 'tanker':
      // Цистерна: цилиндр.
      return (<Rect x={16} y={15} width={43} height={13} rx={6.5} stroke={c} strokeWidth={sw} fill="none" />);
    case 'hazmat':
      // ADR опасные: цистерна + ромб опасности.
      return (
        <>
          <Rect x={16} y={16} width={43} height={12} rx={6} stroke={c} strokeWidth={sw} fill="none" />
          <Polygon points="37,17 41,22 37,27 33,22" stroke={c} strokeWidth={sw * 0.8} fill="none" />
        </>
      );
    case 'dumptruck':
      // Самосвал: наклонный кузов-трапеция.
      return (<Polygon points="19,28 17,16 53,12 58,28" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />);
    case 'grain':
      // Зерновоз: бункер со скошенным низом.
      return (<Polygon points="16,13 59,13 59,23 50,28 25,28 16,23" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />);
    case 'livestock':
      // Скотовоз: коробка с горизонтальными рейками.
      return (
        <>
          {box()}
          <Line x1={16} y1={18} x2={59} y2={18} stroke={c} strokeWidth={sw * 0.7} />
          <Line x1={16} y1={22} x2={59} y2={22} stroke={c} strokeWidth={sw * 0.7} />
          <Line x1={16} y1={26} x2={59} y2={26} stroke={c} strokeWidth={sw * 0.7} />
        </>
      );
    case 'logger':
      // Лесовоз: коники + торцы брёвен.
      return (
        <>
          <Line x1={16} y1={28} x2={59} y2={28} stroke={c} strokeWidth={sw} />
          <Line x1={18} y1={28} x2={18} y2={20} stroke={c} strokeWidth={sw} />
          <Line x1={57} y1={28} x2={57} y2={20} stroke={c} strokeWidth={sw} />
          <Circle cx={28} cy={23} r={4} stroke={c} strokeWidth={sw * 0.8} fill="none" />
          <Circle cx={38} cy={23} r={4} stroke={c} strokeWidth={sw * 0.8} fill="none" />
          <Circle cx={48} cy={23} r={4} stroke={c} strokeWidth={sw * 0.8} fill="none" />
        </>
      );
    case 'auto':
      // Автовоз: два уровня (рампы).
      return (
        <>
          <Polyline points="16,15 59,15 59,21 16,21" stroke={c} strokeWidth={sw * 0.85} fill="none" strokeLinejoin="round" />
          <Polyline points="16,21 59,21 59,28 16,28" stroke={c} strokeWidth={sw * 0.85} fill="none" strokeLinejoin="round" />
        </>
      );
    case 'closed':
      // Закрытый фургон: цельная коробка.
      return (<Rect x={16} y={12} width={43} height={17} rx={2} stroke={c} strokeWidth={sw} fill="none" />);
    case 'microvan':
      // Микроавтобус: короткий скруглённый кузов.
      return (<Rect x={20} y={16} width={32} height={13} rx={3} stroke={c} strokeWidth={sw} fill="none" />);
    default:
      return box();
  }
}

export default function TruckTypeIcon({ type, size = 28, color = '#0A0A0A' }) {
  const sw = 2.1;
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 64 40">
      <Chassis c={color} sw={sw} />
      <Body type={type} c={color} sw={sw} />
    </Svg>
  );
}
