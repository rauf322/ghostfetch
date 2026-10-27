// A rule's title as a file name: its words in small letters, joined by dashes, at most 40
// characters. (Tailwind reads comments too, so the usual word for that would add a CSS rule.)
export function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'rule'
  );
}
