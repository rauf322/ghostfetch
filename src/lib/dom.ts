// Small helpers shared by the editor and the popup: JSON, URLs, files and the side panel.

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
// For the body editor (code-editor.ts), which builds its highlighted text as HTML.
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]!);
}

// Pretty-prints JSON text; returns null if it isn't valid JSON.
export function formatJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

// Returns '' for valid JSON, otherwise a readable "line X, column Y: message".
export function jsonProblem(text: string) {
  if (!text.trim()) return 'Empty body';
  try {
    JSON.parse(text);
    return '';
  } catch (error) {
    // V8 reports either "... at position N (line L column C)", "Unexpected token 'x', "<snippet>"
    // is not valid JSON" (no position) or "Unexpected end of JSON input".
    const { message: raw } = error as SyntaxError;
    const message = raw
      .replace(/ in JSON at position \d+.*$/s, '')
      .replace(/, ".*" is not valid JSON$/s, '');
    const position = /position (\d+)/.exec(raw);
    if (position) return `${lineAndColumn(text, Number(position[1]))}: ${message}`;
    if (/end of JSON input/.test(raw))
      return `${lineAndColumn(text, text.trimEnd().length)}: ${message}`;
    return message;
  }
}

function lineAndColumn(text: string, index: number) {
  const before = text.slice(0, index);
  return `Line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}`;
}

export function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      pathname: parsed.pathname,
    };
  } catch {
    return { host: '', path: url, pathname: url };
  }
}

// Chrome has a side panel; Firefox and its forks (Zen) have a sidebar instead. Both only open
// from inside a click, so call this synchronously in the handler, before any await.
export function openSidePanel(windowId: number) {
  return chrome.sidePanel
    ? chrome.sidePanel.open({ windowId })
    : chrome.sidebarAction.open();
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: filename,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
