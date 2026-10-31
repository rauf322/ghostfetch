// The body editor (with its find bar, vim keys, text size and marks for a mistake) and the
// read-only CodeView.
export { CodeEditor, CodeView } from './code-editor.tsx';
export type {
  CodeEditor as CodeEditorHandle,
  CodeProblem,
} from './engine/code-editor.ts';
export {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  fontSizePreferred,
} from './engine/code-editor.ts';
export type { Language } from './engine/highlight.ts';
export { vimPreferred } from './vim/vim.ts';
