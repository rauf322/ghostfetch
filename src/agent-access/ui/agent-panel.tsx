// Agent access, a card over the sidebar's footer: turned on with the pairing code your agent gives
// you (ghostfetch-mcp's), it says whether an agent is connected, and which; and what the agent did
// while this editor was open, each change opening its rule.
import { useState } from 'react';
import { findRule, ruleStore } from '../../rules/index.ts';
import { useStore } from '../../ui/use-store.ts';
import { cn } from '../../ui/cn.ts';
import { Button } from '../../ui/kit/button.tsx';
import { Card } from '../../ui/kit/card.tsx';
import { Icon } from '../../ui/kit/icon.tsx';
import { Input } from '../../ui/kit/input.tsx';
import { SignalDot } from '../../ui/kit/signal-dot.tsx';
import { parsePairingCode } from '../domain/pairing-code.ts';
import {
  ASKS_CONSENT,
  agentStore,
  turnOffAgent,
  turnOnAgent,
} from '../infrastructure/agent-connection.ts';
import type { AgentActivity, AgentStatus } from '../infrastructure/agent-connection.ts';

// Setting up ghostfetch-mcp and an agent: docs/agent-access.md, on GitHub.
const SETUP = 'https://github.com/rauf322/ghostfetch/blob/main/docs/agent-access.md';

const WORDS: Record<AgentStatus, string> = {
  off: 'Off',
  waiting: 'Waiting',
  connected: 'Connected',
  refused: 'Wrong code',
};

// How many of the agent's changes it lists, the newest first.
const SHOWN = 5;

export function AgentPanel({
  onClose,
  onOpenRule,
}: {
  onClose: () => void;
  onOpenRule: (id: string) => void;
}) {
  const { status, code, agent, activity, declined } = useStore(agentStore);
  const asking = status === 'off' || status === 'refused';
  return (
    <section
      aria-label="Agent access"
      data-testid="agent-panel"
      className="flex-none px-1.5 pb-1.5"
    >
      <Card className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-label font-medium text-t65">Agent access</h2>
          <span
            data-testid="agent-status"
            className={cn(
              'ml-auto flex items-center gap-1.5 text-label',
              status === 'connected' ? 'text-signal' : 'text-t50',
            )}
          >
            {status !== 'off' && <SignalDot on={status === 'connected'} />}
            {WORDS[status]}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close"
            aria-label="Close Agent access"
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </Button>
        </div>
        {asking ? (
          <PairingForm code={code} refused={status === 'refused'} declined={declined} />
        ) : (
          <>
            <p
              data-testid="agent-words"
              className="m-0 text-meta leading-[1.55] text-t50"
            >
              {status === 'connected'
                ? `${agent || 'An agent'} is connected. Keep this editor open while it works.`
                : `Waiting for ghostfetch-mcp on port ${parsePairingCode(code)?.port}, which runs while your agent's session does.`}
            </p>
            {activity.length > 0 && (
              <ActivityList activity={activity.slice(0, SHOWN)} onOpenRule={onOpenRule} />
            )}
            <Button size="sm" data-testid="agent-off" onClick={turnOffAgent}>
              Turn off
            </Button>
          </>
        )}
      </Card>
    </section>
  );
}

// The pairing code, and Turn on (which, in Firefox, asks for the consent first). It starts from the
// code remembered (as ghostfetch-mcp writes it, however it was pasted), each time it shows.
function PairingForm({
  code,
  refused,
  declined,
}: {
  code: string;
  refused: boolean;
  declined: boolean;
}) {
  const [draft, setDraft] = useState(code);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        turnOnAgent(draft);
      }}
    >
      <p className="m-0 text-meta leading-[1.55] text-t50">
        {refused
          ? 'ghostfetch-mcp turned that code down: ask your agent for its pairing code again.'
          : declined
            ? "It needs Firefox's consent, for your rules and the localhost page's requests to go to ghostfetch-mcp on this computer, and from there to your agent. Turn on asks again."
            : `A coding agent, through ghostfetch-mcp, can read and change your rules, and see the requests of the localhost page this editor watches. Paste the pairing code it gives you.${ASKS_CONSENT ? ' Firefox then asks for your consent: what the agent gets goes to ghostfetch-mcp, on this computer.' : ''}`}{' '}
        <a
          href={SETUP}
          target="_blank"
          rel="noreferrer"
          className="text-t65 underline decoration-t40 underline-offset-3 hover:text-foreground hover:decoration-foreground"
        >
          Setting it up
        </a>
      </p>
      <Input
        size="sm"
        data-testid="agent-code"
        aria-label="Pairing code"
        placeholder="47318-ABCD-EFGH-JKMN-PQRS"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="font-mono"
      />
      <Button
        type="submit"
        size="sm"
        variant="primary"
        data-testid="agent-on"
        disabled={!parsePairingCode(draft)}
      >
        Turn on
      </Button>
    </form>
  );
}

// What the agent did, newest first: a change opens its rule, while it's still there.
function ActivityList({
  activity,
  onOpenRule,
}: {
  activity: AgentActivity[];
  onOpenRule: (id: string) => void;
}) {
  // Draws again as rules come and go, which decides what can be opened.
  useStore(ruleStore);
  const clock = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <ul data-testid="agent-activity" className="m-0 flex list-none flex-col gap-0.5 p-0">
      {activity.map(({ id, time, text, ruleId }) => {
        const open = ruleId && findRule(ruleId) ? ruleId : null;
        return (
          <li key={id} className="flex min-w-0 items-baseline gap-2 text-meta">
            {open ? (
              <button
                type="button"
                onClick={() => onOpenRule(open)}
                className="min-w-0 truncate text-left text-t80 hover:text-foreground hover:underline hover:decoration-t40 hover:underline-offset-3"
              >
                {text}
              </button>
            ) : (
              <span className="min-w-0 truncate text-t50">{text}</span>
            )}
            <time className="ml-auto flex-none text-t40 tabular-nums">
              {clock.format(time)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
