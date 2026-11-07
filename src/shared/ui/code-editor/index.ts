// The body editor (with its find bar, vim keys, text size and marks for a mistake), the read-only
// CodeView, and CodeDiff, the body's Diff against the server's response.
export {
  CodeDiff,
  diffLayoutPreferred,
  diffPreferred,
  rememberDiff,
  rememberDiffLayout,
} from './code-diff.tsx';
export type { DiffLayout } from './code-diff.tsx';
export { CodeEditor, CodeView } from './code-editor.tsx';
export type {
  CodeEditor as CodeEditorHandle,
  CodeProblem,
} from './engine/code-editor.ts';
export { vimPreferred } from './vim/vim.ts';
