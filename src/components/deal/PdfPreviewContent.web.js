import React from 'react';
import { getLanguage } from '../../utils/i18n';
import { chatAPI } from '../../utils/chatAPI';

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
export default function PdfPreviewContent({ url, secureFile, title, onMetadata, onRendered, onError }) {
  const frame = React.useRef(null);
  const ready = React.useRef(false);
  const request = React.useRef(null);
  const [generation, setGeneration] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const current = React.useRef({ url, secureFile, onMetadata, onRendered, onError });
  current.current = { url, secureFile, onMetadata, onRendered, onError };
  const sendDocument = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const file = current.current.secureFile;
      const data = file ? await chatAPI.getPrivateFile('attachment', file.roomId, file.fileId, { signal: controller.signal }) : null;
      if (controller.signal.aborted || request.current !== controller) return;
      frame.current?.contentWindow?.postMessage({ channel: 'urtruck-pdf-parent', type: 'open',
        ...(data ? { bytes: data.bytes } : { url: current.current.url }), language: getLanguage() }, window.location.origin);
    } catch {
      if (!controller.signal.aborted) { setFailed(true); current.current.onError?.(); }
    }
  };
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
      else if (event.data.type === 'retry-request') sendDocument();
    };
    window.addEventListener('message', receive);
    return () => { request.current?.abort(); window.removeEventListener('message', receive); };
  }, []);
  React.useEffect(() => { if (ready.current) sendDocument(); return () => request.current?.abort(); }, [url, secureFile?.roomId, secureFile?.fileId]);
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
