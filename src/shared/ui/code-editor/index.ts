// The body editor (with its find bar and vim keys) and the read-only CodeView.
export { CodeEditor, CodeView } from './code-editor.tsx';
export type { CodeEditor as CodeEditorHandle } from './engine/code-editor.ts';
export type { Language } from './engine/highlight.ts';
export { vimPreferred } from './vim/vim.ts';
