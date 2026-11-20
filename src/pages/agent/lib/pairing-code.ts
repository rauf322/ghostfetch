// The pairing code ghostfetch-mcp gives the agent, which you paste into the editor once: the port it
// listens on, then its token in four groups of four (47318-ABCD-EFGH-JKMN-PQRS). Either case, and
// spaces, are fine.
export interface Pairing {
  port: number;
  token: string;
}

export function parsePairingCode(text: string): Pairing | null {
  const match = /^(\d{1,5})-([A-Z2-9-]+)$/.exec(text.replace(/\s+/g, '').toUpperCase());
  if (!match) return null;
  const port = Number(match[1]);
  const token = match[2]!.replaceAll('-', '');
  if (port < 1 || port > 65535 || !/^[A-Z2-9]{16}$/.test(token)) return null;
  return { port, token };
}

// As ghostfetch-mcp writes it, whatever case and spacing it was pasted in.
export function pairingCode({ port, token }: Pairing) {
  return `${port}-${token.match(/.{4}/g)!.join('-')}`;
}
