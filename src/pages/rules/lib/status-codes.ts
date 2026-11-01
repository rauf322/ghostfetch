// The status codes the Status row offers, grouped by class, and the names on them (statusName,
// shared/lib, names any code you type).
import { statusName } from '../../../shared/lib/index.ts';

export const STATUS_GROUPS = [
  { label: '2xx — Success', codes: [200, 201, 204] },
  { label: '4xx — Client error', codes: [400, 401, 403, 404, 409, 422, 429] },
  { label: '5xx — Server error', codes: [500, 503] },
];

// The name on a preset, where two to a row have to fit a narrow side panel: the two long ones
// as they're often shortened. The full name is the preset's tooltip.
const SHORT_NAMES: Record<number, string> = {
  422: 'Unprocessable',
  500: 'Server Error',
};
export function presetName(code: number) {
  return SHORT_NAMES[code] ?? statusName(code);
}
