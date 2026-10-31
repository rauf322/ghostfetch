// Which text of a response rule a body mode edits, and the language it's written in. Keeping the
// server's body (Original) edits none.
import type { BodyMode } from '../../../shared/api/index.ts';

export const BODY_FIELDS: Partial<
  Record<BodyMode, { field: 'body' | 'merge' | 'script'; language: 'json' | 'js' }>
> = {
  replace: { field: 'body', language: 'json' },
  merge: { field: 'merge', language: 'json' },
  script: { field: 'script', language: 'js' },
};
