// Общий helper против оверфлоу текста action-кнопок (приказ владельца
// 04.08, п.«ТЕКСТ НЕ ДОЛЖЕН ВЫХОДИТЬ ИЗ КНОПОК»). На узких экранах
// (реальный iPhone) длинные локализованные строки ("Предложить свою
// цену", "Принять контр $1234.56") вылезали за границу кнопки — потому
// что внутренний row/label центрировались (alignItems:'center'), а не
// растягивались на ширину кнопки, и Yoga не сжимает flex-item ниже его
// «естественной» ширины без явного minWidth:0/flexShrink. numberOfLines
// без width-констрейнта выше по дереву ничего не обрезает.
//
// Используется в PrimaryCTA/SecondaryButton/DestructiveButton — единая
// точка правки, а не подгонка каждого экрана отдельно.

import { Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width || 390;
// iPhone SE/mini и большинство Android-компактов — 320-360px.
export const IS_NARROW_SCREEN = SCREEN_W > 0 && SCREEN_W <= 360;

export function safeFontSize(base) {
  return IS_NARROW_SCREEN ? Math.max(11, base - 1) : base;
}

// Кнопка-контейнер: никогда не шире родителя, разрешено сжиматься,
// overflow:'hidden' — страховка, если что-то всё же не впишется.
export const SAFE_BUTTON_STYLE = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  flexShrink: 1,
  overflow: 'hidden',
};

// Внутренний row (иконка + текст): растянут на всю кнопку (не
// «естественная» центрированная ширина), поэтому дочерний текст реально
// ограничен этой шириной и numberOfLines/ellipsizeMode начинают работать.
export const SAFE_ROW_STYLE = {
  alignSelf: 'stretch',
  minWidth: 0,
  maxWidth: '100%',
};

// Иконка — фиксированной ширины, не сжимается и не даёт тексту наехать на себя.
export const SAFE_ICON_STYLE = {
  flexShrink: 0,
  width: 18,
  textAlign: 'center',
};

// Текст — единственный элемент, которому разрешено сжиматься/обрезаться.
export const SAFE_LABEL_STYLE = {
  flexShrink: 1,
  minWidth: 0,
  flex: 1,
  textAlign: 'center',
};
