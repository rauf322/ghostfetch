// The status codes the Status tab offers, grouped by class, and the standard name (RFC 9110 and
// the registry's common ones) of any code you type.
export const STATUS_GROUPS = [
  { label: '2xx — Success', codes: [200, 201, 204] },
  { label: '4xx — Client error', codes: [400, 401, 403, 404, 409, 422, 429] },
  { label: '5xx — Server error', codes: [500, 503] },
];

const NAMES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Content Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a Teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Content',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  507: 'Insufficient Storage',
  511: 'Network Authentication Required',
};

// '' for a code without a standard name, or no code.
export function statusName(code: string | number) {
  return NAMES[Number(code)] ?? '';
}

// The name on a preset, where two to a row have to fit a narrow side panel: the two long ones
// as they're often shortened. The full name is the preset's tooltip.
const SHORT_NAMES: Record<number, string> = {
  422: 'Unprocessable',
  500: 'Server Error',
};
export function presetName(code: number) {
  return SHORT_NAMES[code] ?? statusName(code);
}
