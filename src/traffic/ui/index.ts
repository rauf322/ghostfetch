// Traffic's screens: the Traffic view, and the hooks that run the editor's live log of a tab's
// requests and read it. The way into this folder, and Traffic's only door with React behind it:
// the extension's pages import from here, and the background and the page scripts never do
// (theirs is ../index.ts).
export { TrafficPage } from './traffic-page.tsx';
export { useTraffic, useTrafficLog, useTrafficValue } from './use-traffic-log.ts';
