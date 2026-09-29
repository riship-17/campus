import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { clubRouter } from './modules/club/club.routes.js';
import { eventRouter } from './modules/event/event.routes.js';
import { meRouter } from './modules/registration/registration.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) =>
  res.json({ data: { status: 'ok', time: new Date().toISOString() } })
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/clubs', clubRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/me', meRouter);

// Phase 3 onward: attendance, feedback, certificates, notifications, admin.
