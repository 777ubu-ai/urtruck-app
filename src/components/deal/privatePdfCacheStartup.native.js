import { Directory, File, Paths } from 'expo-file-system';
import { sweepStalePrivatePdfCaches } from './privatePdfCache';

export function sweepPrivatePdfCache(excludePath = '') {
  try {
    return sweepStalePrivatePdfCaches({
      entries: new Directory(Paths.cache).list(),
      excludePath,
      cacheUri: Paths.cache.uri,
      createFile: (uri) => new File(uri),
    });
  } catch {
    return 0;
  }
}
