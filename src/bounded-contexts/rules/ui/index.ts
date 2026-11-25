// Rules' screens: the Rules view (the open rule, or New rule) and the rules in the editor's sidebar.
// The way into this folder for the editor, and the door with React behind it, as ../index.ts is the
// one without. The widgets other screens show are a public file each instead: a rule's and a
// group's switch (rule-switch.tsx, group-switch.tsx), which groups are folded (group-folds.ts), the
// group a new rule goes into (group-picker.tsx, new-rule-group.ts) and rules files
// (rules-file.tsx). The popup takes its switches and folds from their own files, so it never loads
// the Rules view; the background and the page scripts take nothing from here. The sidebar's footer
// says what was deleted last, with its Undo and its ⌘Z (undo-notice.tsx, undo-delete.ts).
export { RuleList } from './rule-list.tsx';
export { RulesPage } from './rules-page.tsx';
export { UndoNotice } from './undo-notice.tsx';
export { listenForUndoKey } from './undo-delete.ts';
