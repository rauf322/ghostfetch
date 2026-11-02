// The words for what made a request, as the list ("localhost:3000 · fetch()") and the drawer's
// chip say it.
import type { EntryKind } from '../../../shared/api/index.ts';

export const KIND_LABELS: Record<EntryKind, string> = {
  fetch: 'fetch()',
  xhr: 'XHR',
};
