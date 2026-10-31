// The Headers tab: headers a response rule sets on the response or removes from it.
import type { Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { HeaderRows } from './header-rows.tsx';

export function HeadersPanel({ rule }: { rule: Rule }) {
  return (
    <>
      <CardHint>Set or remove headers on the response the page gets.</CardHint>
      <HeaderRows rule={rule} pick={(current) => current.response.headers} />
    </>
  );
}
