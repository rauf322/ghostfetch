// A block rule has nothing to set: this says what happens to the requests it matches.
import { Card, CardHint } from '../../../../shared/ui/kit/card.tsx';

export function BlockSection() {
  return (
    <Card>
      <CardHint>
        Matching requests fail with <code>net::ERR_BLOCKED_BY_CLIENT</code>, as if the
        server were unreachable. Handy for testing offline and error states.
      </CardHint>
    </Card>
  );
}
