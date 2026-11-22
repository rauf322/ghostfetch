// What a field with list="<id>" offers as you type: the rule editor's Content-Type and header
// name fields.
const CONTENT_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'application/xml',
  'application/javascript',
  'application/graphql-response+json',
];
const HEADER_NAMES = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'Cache-Control',
  'Cookie',
  'Set-Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Content-Security-Policy',
  'X-Frame-Options',
];

export function FieldSuggestions() {
  return (
    <>
      <Suggestions id="content-types" values={CONTENT_TYPES} />
      <Suggestions id="header-names" values={HEADER_NAMES} />
    </>
  );
}

function Suggestions({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- its value is the label
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}
