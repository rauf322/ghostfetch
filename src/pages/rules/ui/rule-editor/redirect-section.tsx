// "Redirect to": where a redirect rule sends the requests it matches.
import type { Rule } from '../../../../shared/api/index.ts';
import { Card, CardHint, CardTitle } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { editRule } from '../../model/edit-rule.ts';

export function RedirectSection({ rule, index }: { rule: Rule; index: number }) {
  return (
    <Card>
      <CardTitle index={index}>Redirect to</CardTitle>
      <Input
        data-testid="redirect-to"
        value={rule.redirect.to}
        placeholder="http://localhost:3000/api/users"
        onChange={(event) =>
          editRule(rule.id, (current) => {
            current.redirect.to = event.target.value;
          })
        }
      />
      <CardHint>
        A full URL, including <code>http://</code> or <code>https://</code>
        {'. With '}
        <b>URL regex</b>
        {' you can reuse capture groups: match '}
        <code>{'^https://api\\.example\\.com/(.*)'}</code>
        {' and redirect to '}
        <code>{'http://localhost:4000/\\1'}</code>.
      </CardHint>
    </Card>
  );
}
