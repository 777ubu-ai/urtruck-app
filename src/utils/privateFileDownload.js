import { chatAPI } from './chatAPI';

const pending = new Set();

// Вызывается только на web после явного действия пользователя.
export async function downloadPrivateAttachment(roomId, fileId, name) {
  const key = JSON.stringify([roomId, fileId]);
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const { bytes, mime } = await chatAPI.getPrivateFile('attachment', roomId, fileId);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement('a');
    try {
      link.href = url;
      link.download = String(name || 'document').replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 180) || 'document';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      // Браузеру нужно время передать данные в менеджер загрузок.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } finally {
    pending.delete(key);
  }
}
