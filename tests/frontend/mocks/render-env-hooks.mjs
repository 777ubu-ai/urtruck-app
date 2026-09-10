// Resolve/load-хуки для gray-box render-тестов экранов (см. react-stub.mjs).
// Регистрируется из теста через module.register(). Делегирует прочие
// спецификаторы дальше по цепочке (в т.ч. в ../loader.mjs, который мокает
// react-native / AsyncStorage / expo-constants), поэтому НЕ дублирует его
// маппинги — только добавляет то, что loader не покрывает. load() дополнительно
// транспилирует JSX в файлах src/ через sucrase (plain Node не парсит JSX).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transform } from 'sucrase';

const HERE = new URL('.', import.meta.url).href;
const MOCK = (name) => `${HERE}${name}`;

const MAP = {
  'react': MOCK('react-stub.mjs'),
  'react-native-safe-area-context': MOCK('safe-area-stub.mjs'),
  '@react-navigation/native': MOCK('navigation-stub.mjs'),
  '@react-navigation/native-stack': MOCK('navigation-stub.mjs'),
  '@react-navigation/bottom-tabs': MOCK('navigation-stub.mjs'),
  '@react-navigation/stack': MOCK('navigation-stub.mjs'),
  'react-native-svg': MOCK('react-native-svg.mjs'),
};

export async function resolve(specifier, context, nextResolve) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true };
  if (specifier.startsWith('@expo/vector-icons')) return { url: MOCK('vector-icons-stub.mjs'), shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.includes('/src/') || !url.endsWith('.js') || result.format !== 'module') {
    return result;
  }
  const source = readFileSync(fileURLToPath(url), 'utf8');
  if (!source.includes('<')) return result; // дёшево отсеять файлы без JSX
  const { code } = transform(source, {
    transforms: ['jsx', 'flow'],
    jsxPragma: 'React.createElement',
    jsxFragmentPragma: 'React.Fragment',
  });
  return { format: 'module', source: code, shortCircuit: true };
}

void fileURLToPath;
