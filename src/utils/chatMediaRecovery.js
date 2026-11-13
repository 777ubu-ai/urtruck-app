// Не меняет и не удаляет локальный файл; повторно загружает только старый ключ без доказанной принадлежности.
export async function sendPhotoWithRecovery({ previousKey, localUri, isCurrent, upload, send, onKey = () => {} }) {
  const check = () => { if (!isCurrent()) throw new Error('CHAT_SESSION_CHANGED'); };
  const uploadCurrent = async () => {
    check();
    if (!localUri) throw new Error('LOCAL_PHOTO_UNAVAILABLE');
    const key = await upload(localUri);
    check();
    if (!key) throw new Error('photo_upload');
    onKey(key);
    return key;
  };
  check();
  let key = previousKey || await uploadCurrent();
  check();
  try {
    return await send(key);
  } catch (error) {
    if (!previousKey || error?.detail !== 'FILE_UPLOAD_REQUIRED') throw error;
    key = await uploadCurrent();
    check();
    return send(key);
  }
}
