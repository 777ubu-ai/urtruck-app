import { Directory, File, Paths } from 'expo-file-system';
import { stagePrivateAudio, sweepPrivateAudioEntries } from './privateAudioCache';
import { deletePrivatePdfCachePath } from '../components/deal/privatePdfCache';

let swept = false;
export function stageProtectedVoice(bytes, mime) {
  if (!swept) {
    swept = true;
    try {
      sweepPrivateAudioEntries(new Directory(Paths.cache).list(), value =>
        deletePrivatePdfCachePath(value, { cacheUri: Paths.cache.uri, createFile: path => new File(path) }));
    } catch { /* cache может быть временно недоступен */ }
  }
  return stagePrivateAudio({ FileClass: File, cacheRoot: Paths.cache, bytes, mime,
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
}
