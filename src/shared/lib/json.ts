// JSON text: pretty-printed, or what's wrong with it.

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
