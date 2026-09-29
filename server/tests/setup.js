import { vi } from 'vitest';
import { sentMail } from './helpers.js';

/**
 * Swap the mailer for a recorder. Tests then read verification and reset tokens out of the
 * captured message body exactly as a student would read them out of their inbox — the token
 * is never handed to the test through a back door, so the real delivery path stays covered.
 */
vi.mock('../src/modules/mail/mailer.js', () => ({
  sendMail: async (message) => {
    sentMail.push(message);
    return { messageId: `test-${sentMail.length}` };
  },
}));
