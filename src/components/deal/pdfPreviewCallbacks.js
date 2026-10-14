export function createPdfPreviewCallbacks({ onMetadata, onRendered, onError, onCacheFile }) {
  return {
    onLoadComplete(pages, path, size) {
      if (path) onCacheFile?.(path);
      if (pages > 0 && size?.width > 0 && size?.height > 0) {
        onMetadata?.({ pages, width: size.width, height: size.height });
      } else {
        onError?.('invalid_page_geometry');
      }
    },
    onPageChanged(page, pages) {
      if (page > 0 && pages > 0) onRendered?.({ page, pages });
      else onError?.('invalid_page_index');
    },
    onError() {
      onError?.('native_render_failed');
    },
  };
}
