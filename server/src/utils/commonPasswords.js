/**
 * Small embedded deny-list of the passwords that actually show up in credential dumps,
 * plus the campus-flavoured ones students reach for first. Ten characters of "password123"
 * is still "password123".
 *
 * Swap this for a full Have-I-Been-Pwned k-anonymity range check before going live at scale.
 */
const COMMON = new Set(
  [
    '123456',
    '123456789',
    '12345678',
    'password',
    'qwerty123',
    'qwerty1',
    '111111',
    '12345',
    'secret123',
    '123123',
    '1234567890',
    '1234567',
    '000000',
    'qwerty',
    'abc123',
    'password1',
    'password123',
    'iloveyou',
    '1q2w3e4r',
    'admin123',
    'qwertyuiop',
    '654321',
    '555555',
    'lovely',
    '7777777',
    'welcome',
    '888888',
    'princess',
    'dragon',
    'sunshine',
    'letmein',
    'monkey',
    'football',
    'charlie',
    'aa123456',
    'donald',
    'freedom',
    'whatever',
    'trustno1',
    'passw0rd',
    'zaq12wsx',
    'asdfghjkl',
    'qazwsxedc',
    'iitbombay',
    'iitbombay1',
    'campusconnect',
    'college123',
    'student123',
    'hostel123',
    'mumbai123',
    'india123',
    'cricket123',
    'changeme',
    'letmein123',
    'welcome123',
    'test1234',
    'testtest',
    'administrator',
    'root1234',
  ].map((value) => value.toLowerCase())
);

/**
 * Returns a human-readable reason the password is unacceptable, or null if it passes.
 * @param {string} password
 * @param {{ email?: string, name?: string, rollNumber?: string }} [identity]
 */
export function checkPasswordStrength(password, identity = {}) {
  const value = password.trim();

  if (value.length < 10) return 'Use at least 10 characters.';
  if (value.length > 128) return 'Use at most 128 characters.';
  if (COMMON.has(value.toLowerCase())) return 'That password is too common. Pick something else.';

  // Repeats and straight runs: "aaaaaaaaaa", "1234567890".
  if (/^(.)\1+$/.test(value)) return 'That password is a single repeated character.';
  if (isSequential(value.toLowerCase())) return 'That password is a simple keyboard sequence.';

  const lower = value.toLowerCase();
  const localPart = identity.email ? identity.email.split('@')[0].toLowerCase() : '';
  const fragments = [
    localPart,
    identity.rollNumber?.toLowerCase(),
    ...(identity.name ?? '').toLowerCase().split(/\s+/),
  ].filter((fragment) => fragment && fragment.length >= 4);

  if (fragments.some((fragment) => lower.includes(fragment))) {
    return 'Do not reuse your name, roll number, or email in your password.';
  }

  return null;
}

function isSequential(value) {
  if (value.length < 6) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i += 1) {
    const delta = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}
