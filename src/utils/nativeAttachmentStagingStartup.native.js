import { Directory, Paths } from 'expo-file-system';
import { sweepStaleNativeUploads } from './nativeAttachmentStaging';

export function sweepNativeAttachmentStaging() {
  sweepStaleNativeUploads({ Directory, cacheRoot: Paths.cache });
}
