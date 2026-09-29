import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * The only place in the app that renders HTML it did not write.
 *
 * The server already sanitises descriptions on write with a strict allowlist. This is the
 * second pass, on the machine that would actually execute anything that slipped through —
 * belt and braces, because "the API sanitised it" is an assumption about a different process.
 */
const ALLOWED_TAGS = [
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
];

export function RichText({ html, className }) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html ?? '', {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
        ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
      }),
    [html]
  );

  return (
    <div
      className={className}
      // Sanitised immediately above; see the note on why this happens twice.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
