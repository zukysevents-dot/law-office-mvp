// Czech typography: one-letter prepositions and conjunctions (k, s, v, z, o,
// u, a, i) must not end a line — bind them to the following word with a
// non-breaking space. Applied at render time so source strings stay readable.
export function withCzechNbsp(text: string): string {
  return text.replace(/(^|[\s(„—-])([aikosuvzAIKOSUVZ]) /g, "$1$2 ");
}
