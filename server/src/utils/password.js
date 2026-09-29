import argon2 from 'argon2';

/**
 * argon2id with parameters tuned for an interactive login on a small VM:
 * ~64 MB memory, 3 passes. Raise memoryCost if the host can afford it.
 */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export function hashPassword(plain) {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed hash must read as "wrong password", never as a crash.
    return false;
  }
}

export function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, ARGON_OPTIONS);
  } catch {
    return true;
  }
}
