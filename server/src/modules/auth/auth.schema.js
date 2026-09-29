import { z } from 'zod';
import { env } from '../../config/env.js';
import { DEPARTMENTS, MAX_ACADEMIC_YEAR } from '../user/user.constants.js';

const collegeEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(160)
  .refine(
    (value) => env.ALLOWED_EMAIL_DOMAINS.some((domain) => value.endsWith(`@${domain}`)),
    `Use your college email (${env.ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')}).`
  );

// Strength beyond length is enforced in the service, where we can compare against the
// user's own name and roll number. Keep the schema to shape only.
const password = z.string().min(10, 'Use at least 10 characters.').max(128);

const opaqueToken = z.string().trim().min(20, 'That link is not valid.').max(256);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(80),
    email: collegeEmail,
    password,
    rollNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, 'Roll numbers are 6–16 letters and digits.')
      .optional(),
    department: z.enum(DEPARTMENTS).optional(),
    year: z.coerce.number().int().min(1).max(MAX_ACADEMIC_YEAR).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(160),
    password: z.string().min(1, 'Enter your password.').max(128),
  })
  .strict();

export const verifyEmailSchema = z.object({ token: opaqueToken }).strict();

export const resendVerificationSchema = z.object({ email: collegeEmail }).strict();

export const forgotPasswordSchema = z.object({ email: collegeEmail }).strict();

export const resetPasswordSchema = z.object({ token: opaqueToken, password }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(128),
    newPassword: password,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    department: z.enum(DEPARTMENTS).optional(),
    year: z.coerce.number().int().min(1).max(MAX_ACADEMIC_YEAR).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');
