// Badges and status codes, which say what they mean in words rather than colours.
import { Badge, StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import { Cell, Row } from '../cell.tsx';

export function BadgeSection() {
  return (
    <Cell title="Badge and status" note="words, not colours">
      <Row
        label="A rule fired · rule error"
        className="flex flex-wrap items-center gap-4"
      >
        <Badge variant="fired">Mocked</Badge>
        <Badge variant="fired">Modified</Badge>
        <Badge variant="error">Rule error</Badge>
      </Row>
      <Row
        label="Status codes: 2xx · 3xx · 4xx · 5xx · network error · none"
        className="flex flex-wrap items-center gap-4"
      >
        <StatusCode status={200} />
        <StatusCode status={204} />
        <StatusCode status={304} />
        <StatusCode status={401} />
        <StatusCode status={404} />
        <StatusCode status={500} />
        <StatusCode status={null} failed />
        <StatusCode status={null} />
      </Row>
    </Cell>
  );
}
