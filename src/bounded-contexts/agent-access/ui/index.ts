// Agent access: a coding agent working with the rules, through the editor (its words are in
// docs/glossary/agent-access.md, how it works and its security in docs/agent-access.md). What a
// pairing code is, and what a dev host is, whose pages' requests an agent may see (domain/); what
// each of the agent's tools does, and what they say of a rule (application/); the connection to
// ghostfetch-mcp (infrastructure/); and the editor's Agent button, its panel and the hook that runs
// Agent access while the editor is open (ui/). The only way into this folder, for the editor alone
// (src/app/sidepanel/): the popup, the background and the page scripts take nothing from here.
// Outside ui/ the folder is plain TypeScript with no npm package and no React; of Ghostfetch's own
// code it may import only the rules, traffic and sites by their doors, the shared kernel and lib,
// and its domain/ only lib.
export { AgentButton } from './agent-button.tsx';
export { AgentPanel } from './agent-panel.tsx';
export { useAgentAccess } from './use-agent-access.ts';
