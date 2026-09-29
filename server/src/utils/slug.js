import { customAlphabet } from 'nanoid';

const suffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 5);

/** "Intro to Rust & Memory Safety" → "intro-to-rust-memory-safety" */
export function slugify(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

/**
 * Finds a free slug for `title` in `model`.
 *
 * Tries the clean slug first so URLs stay readable, then falls back to a random suffix
 * rather than an incrementing counter: `-2` would leak that a similarly titled event already
 * exists, and two clubs running "Orientation" should not be able to probe each other's drafts.
 *
 * @param {import('mongoose').Model<any>} model
 * @param {string} title
 * @param {import('mongoose').Types.ObjectId} [excludeId] Ignore this document when checking
 */
export async function uniqueSlug(model, title, excludeId) {
  const base = slugify(title) || 'untitled';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${suffix()}`;
    const filter = excludeId ? { slug: candidate, _id: { $ne: excludeId } } : { slug: candidate };
    const taken = await model.exists(filter);
    if (!taken) return candidate;
  }

  // Five collisions on a random 5-char suffix is not going to happen, but never loop forever.
  return `${base}-${suffix()}${suffix()}`;
}
