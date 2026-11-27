// What can be done with a request in the log, in one place: its row's slot (as icons), its
// right-click menu (as items) and the open request (as buttons) take these words, icons and
// actions from here, each in its own way, so they can't drift apart. Mock this response makes a
// rule of the response; Copy URL and Copy as cURL copy the request, each saying it copied in its
// control (useCopied()); Open the rule, in the menu, opens the rule that answered it, where one
// did. The open request also has Copy body, and no Open the rule: its Open is its own, a link by
// the rule's name (request-detail/request-facts.tsx).
import { ruleFromEntry } from '../../rules/index.ts';
import type { Rule } from '../../rules/index.ts';
import type { LogEntry } from '../index.ts';
import { curlCommand } from '../../../lib/index.ts';
import type { IconName } from '../../../ui/kit/icon.tsx';
import { notify } from '../../../ui/kit/toast.tsx';

export interface EntryAction {
  // What its controls are known by (the open request's data-testid, a row's row-…, the menu's
  // request-menu-…).
  id: string;
  label: string;
  icon: IconName;
}

// A copy: what it copies, in a few words ("the URL", for "Copied the URL"), and the text, made
// when it's asked for (a cURL command of a large body).
export interface CopyAction extends EntryAction {
  what: string;
  text: (entry: LogEntry) => string;
}

export const MOCK: EntryAction = {
  id: 'mock',
  label: 'Mock this response',
  icon: 'wand',
};

export const COPY_URL: CopyAction = {
  id: 'copy-url',
  label: 'Copy URL',
  icon: 'link',
  what: 'the URL',
  text: (entry) => entry.url,
};

export const COPY_CURL: CopyAction = {
  id: 'copy-curl',
  label: 'Copy as cURL',
  icon: 'terminal',
  what: 'the cURL command',
  text: (entry) =>
    curlCommand({ method: entry.method, url: entry.url, body: entry.requestBody }),
};

export const COPY_BODY: EntryAction & Pick<CopyAction, 'what'> = {
  id: 'copy-body',
  label: 'Copy body',
  icon: 'copy',
  what: 'the response body',
};

export const OPEN_RULE: EntryAction = {
  id: 'open-rule',
  label: 'Open the rule',
  icon: 'rule',
};

// A row's actions, in its slot and its right-click menu, in this order: Mock this response, then
// its two copies. The menu has Open the rule after them, where a rule answered.
export const ROW_COPIES = [COPY_URL, COPY_CURL] as const;
export const ROW_ACTIONS = [MOCK, ...ROW_COPIES] as const;

// Mock this response: a rule of the request's response, which the editor places and opens
// (onMock), and a word when the response was cut at 1 MB, as the mock only has that much.
export function mockEntry(
  entry: LogEntry,
  onMock: (draft: Rule, entry: LogEntry) => void,
) {
  onMock(ruleFromEntry(entry), entry);
  if (entry.truncated)
    notify('The response was over 1 MB', {
      kind: 'error',
      description: 'The mock only has the first 1 MB of it.',
      duration: 6000,
    });
}
