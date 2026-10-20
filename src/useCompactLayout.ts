import {useSyncExternalStore} from 'react';

const COMPACT_QUERY = '(max-width: 900px)';
function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
function getSnapshot(): boolean {
  return window.matchMedia(COMPACT_QUERY).matches;
}
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
