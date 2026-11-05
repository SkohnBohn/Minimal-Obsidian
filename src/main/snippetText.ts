// Strips pure markdown syntax noise from preview-snippet text (search sidebar,
// backlinks panel) so they read as plain prose instead of raw source — while
// leaving the actual document content/formatting untouched everywhere else.
// Order matters: longer delimiters (**bold**) must be peeled before the
// shorter ones (*italic*) that are a subset of their characters.
export function stripMarkdownNoise(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')                              // leading heading marker
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, display) => display ?? target) // wikilinks + image embeds
    .replace(/\[\^[^\]]+\]:?/g, '')                         // footnote references/definitions
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')                  // bold+italic
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                     // bold
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, '$1')         // italic *text*
    .replace(/(?<![_\w])_([^_\n]+)_(?!_)/g, '$1')            // italic _text_
    .replace(/~~(.+?)~~/g, '$1')                            // strikethrough
    .replace(/`([^`]+)`/g, '$1')                            // inline code
    // A snippet is built from "before"+<mark>+"after" slices, so when the
    // match itself sits inside a formatted span, each half only ever sees
    // ONE side of the delimiter pair — the passes above require both sides
    // present and so leave it untouched. Mop up what's left: multi-char
    // tokens and brackets are unambiguous noise even alone; bare single
    // */_ are left alone since those do occur as literal characters.
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\[\[|\]\]/g, '')
}
