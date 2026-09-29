import sanitizeHtml from 'sanitize-html';

/**
 * Strict allowlist for club-authored event descriptions.
 *
 * Club reps are trusted people, but "trusted" is not "incapable of pasting Word HTML with a
 * tracking pixel in it", and a compromised rep account must not become stored XSS on a page
 * every student visits. No script, no style, no iframe, no event handlers, no inline styles.
 * Links are forced to http/https and get rel="noopener" so a target page cannot reach back.
 */
const OPTIONS = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'a',
    'code',
    'pre',
    'hr',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeRichText(html) {
  return sanitizeHtml(String(html ?? ''), OPTIONS).trim();
}

/**
 * Plain-text preview for list cards and search snippets.
 *
 * Block tags are turned into spaces before stripping — otherwise `<p>one</p><p>two</p>`
 * collapses to "onetwo" and every card summary reads like a typo.
 */
export function toPlainText(html, maxLength = 280) {
  const spaced = String(html ?? '').replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, ' $& ');

  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
