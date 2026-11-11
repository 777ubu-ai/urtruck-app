export function stageProtectedVoice(bytes, mime) {
  const type = String(mime || '').split(';')[0].toLowerCase();
  if (!type.startsWith('audio/') && type !== 'application/octet-stream') throw new Error('invalid_audio_type');
  const uri = URL.createObjectURL(new Blob([bytes], { type }));
  return { uri, dispose: () => URL.revokeObjectURL(uri) };
}
