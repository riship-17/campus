import { z } from 'zod';

/**
 * Mirrors server/src/modules/auth/auth.schema.js so the user sees the same rule twice —
 * instantly in the browser, and authoritatively on the server. The client copy is a
 * convenience; it is never the gatekeeper.
 */

const ALLOWED_DOMAINS = ['iitb.ac.in'];

export const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Aerospace Engineering',
  'Metallurgical Engineering & Materials Science',
  'Engineering Physics',
  'Mathematics & Computing',
  'Energy Science & Engineering',
  'Biosciences & Bioengineering',
  'Industrial Design Centre',
  'Humanities & Social Sciences',
];

const collegeEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your college email.')
  .email('Enter a valid email address.')
  .refine(
    (value) => ALLOWED_DOMAINS.some((domain) => value.endsWith(`@${domain}`)),
    `Use your college email (${ALLOWED_DOMAINS.map((d) => `@${d}`).join(' or ')}).`
  );

const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.');

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email.')
    .email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  email: collegeEmail,
  password,
  rollNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,16}$/, 'Roll numbers are 6–16 letters and digits.'),
  department: z.enum(DEPARTMENTS, { errorMap: () => ({ message: 'Pick your department.' }) }),
  year: z.coerce.number().int().min(1, 'Pick your year.').max(5),
});

export const forgotPasswordSchema = z.object({ email: collegeEmail });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Both passwords must match.',
  });
