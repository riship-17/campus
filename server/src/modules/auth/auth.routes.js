import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireCsrfToken } from '../../middleware/csrf.js';
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
} from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  controller.register
);

authRouter.post('/verify-email', validate({ body: verifyEmailSchema }), controller.verifyEmail);

authRouter.post(
  '/resend-verification',
  forgotPasswordLimiter,
  validate({ body: resendVerificationSchema }),
  controller.resendVerification
);

authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);

// Cookie-authenticated: the double-submit CSRF header is mandatory here.
authRouter.post('/refresh', requireCsrfToken, controller.refresh);
authRouter.post('/logout', requireCsrfToken, controller.logout);

authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword
);

authRouter.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  controller.resetPassword
);

authRouter.get('/me', authenticate, controller.me);
authRouter.patch('/me', authenticate, validate({ body: updateProfileSchema }), controller.updateMe);

authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  controller.changePassword
);
