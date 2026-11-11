import React from 'react';
import { getLanguage } from '../../utils/i18n';

const viewerFailure = {
  RU: ['Не удалось открыть просмотр документа.', 'Повторить'],
  KK: ['Құжатты қарау мүмкін болмады.', 'Қайталау'],
  EN: ['Could not open the document viewer.', 'Retry'],
  ZH: ['无法打开文档预览。', '重试'],
  TR: ['Belge görüntüleyici açılamadı.', 'Tekrar dene'],
  UZ: ['Hujjatni koʻrish oynasi ochilmadi.', 'Qayta urinish'],
  KY: ['Документти көрүү ачылган жок.', 'Кайталоо'],
  TG: ['Намоиши ҳуҷҷат кушода нашуд.', 'Дубора'],
  BE: ['Не ўдалося адкрыць прагляд дакумента.', 'Паўтарыць'],
};

// PDF остаётся на собственном origin: ссылка передаётся в viewer через
// postMessage, а не попадает в адрес страницы или сторонний сервис.
export default function PdfPreviewContent({ url, title, onMetadata, onRendered, onError }) {
  const frame = React.useRef(null);
  const ready = React.useRef(false);
  const [generation, setGeneration] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const current = React.useRef({ url, onMetadata, onRendered, onError });
  current.current = { url, onMetadata, onRendered, onError };
  const sendDocument = () => frame.current?.contentWindow?.postMessage({ channel: 'urtruck-pdf-parent', type: 'open', url: current.current.url, language: getLanguage() }, window.location.origin);
  React.useEffect(() => {
    const receive = event => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'urtruck-pdf-viewer') return;
      if (event.data.type === 'ready') {
        ready.current = true;
        setFailed(false);
        sendDocument();
      } else if (event.data.type === 'metadata') current.current.onMetadata?.({ pages: event.data.pages });
      else if (event.data.type === 'rendered') current.current.onRendered?.({ page: event.data.page, pages: event.data.pages });
      else if (event.data.type === 'error') current.current.onError?.();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  React.useEffect(() => { if (ready.current) sendDocument(); }, [url]);
  React.useEffect(() => {
    ready.current = false;
    setFailed(false);
    const timer = setTimeout(() => { if (!ready.current) { setFailed(true); current.current.onError?.(); } }, 15000);
    return () => clearTimeout(timer);
  }, [generation]);
  const copy = viewerFailure[getLanguage()] || viewerFailure.EN;
  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
    failed && React.createElement('div', { role: 'alert', style: { color: '#F3F7F4', textAlign: 'center', padding: 16 } },
      React.createElement('p', null, copy[0]),
      React.createElement('button', { onClick: () => setGeneration(value => value + 1) }, copy[1])),
    React.createElement('iframe', {
    key: generation,
    ref: frame,
    title,
    src: '/pdf-viewer/index.html',
    style: { flex: 1, width: '100%', border: 0, backgroundColor: '#0F1512', display: failed ? 'none' : 'block' },
    sandbox: 'allow-same-origin allow-scripts',
    referrerPolicy: 'no-referrer',
  }));
}
