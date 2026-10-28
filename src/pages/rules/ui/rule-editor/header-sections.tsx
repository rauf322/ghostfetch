// A headers rule's two sections: the request headers it sets or removes, and the response headers,
// with a shortcut that adds the usual CORS ones.
import { editRule } from '../../../../shared/api/index.ts';
import type { HeaderRow, Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Card, CardHint, CardTitle } from '../../../../shared/ui/kit/card.tsx';
import { HeaderRows } from './header-rows.tsx';

const CORS_HEADERS: HeaderRow[] = [
  { op: 'set', name: 'Access-Control-Allow-Origin', value: '*' },
  {
    op: 'set',
    name: 'Access-Control-Allow-Methods',
    value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  },
  { op: 'set', name: 'Access-Control-Allow-Headers', value: '*' },
];

// `index` is the first section's number; the second follows it.
export function HeaderSections({ rule, index }: { rule: Rule; index: number }) {
  return (
    <>
      <Card>
        <CardTitle index={index} note="sent to the server">
          Request headers
        </CardTitle>
        <HeaderRows rule={rule} pick={(current) => current.headers.request} />
      </Card>
      <Card>
        <CardTitle index={index + 1} note="seen by the page">
          Response headers
        </CardTitle>
        <HeaderRows rule={rule} pick={(current) => current.headers.response} />
        <CardHint>
          {'Fighting CORS against a local backend? '}
          <Button
            variant="link"
            size="inline"
            onClick={() =>
              editRule(rule.id, (current) => {
                const rows = current.headers.response;
                for (const header of CORS_HEADERS) {
                  if (
                    !rows.some(
                      (row) => row.name.toLowerCase() === header.name.toLowerCase(),
                    )
                  )
                    rows.push({ ...header });
                }
              })
            }
          >
            Add CORS headers
          </Button>
          {" (doesn't work for requests that send cookies, because "}
          <code>*</code> isn't allowed with credentials).
        </CardHint>
      </Card>
    </>
  );
}
