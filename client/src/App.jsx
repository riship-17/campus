import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { RequireAuth, RedirectIfAuthenticated } from './routes/RequireAuth.jsx';
import { RouteError } from './routes/RouteError.jsx';
import { Skeleton } from './components/ui/Skeleton.jsx';

// Split by area so a student never downloads the club desk or admin bundles.
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const EventsPage = lazy(() => import('./pages/EventsPage.jsx'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage.jsx'));
const ClubsPage = lazy(() => import('./pages/ClubsPage.jsx'));
const ClubDetailPage = lazy(() => import('./pages/ClubDetailPage.jsx'));

const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage.jsx'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage.jsx'));

const DashboardPage = lazy(() => import('./pages/student/DashboardPage.jsx'));
const MyRegistrationsPage = lazy(() => import('./pages/student/MyRegistrationsPage.jsx'));
const EntryPassPage = lazy(() => import('./pages/student/EntryPassPage.jsx'));

const ClubDeskPage = lazy(() => import('./pages/club/ClubDeskPage.jsx'));
const ClubEventsPage = lazy(() => import('./pages/club/ClubEventsPage.jsx'));
const EventFormPage = lazy(() => import('./pages/club/EventFormPage.jsx'));
const EventRegistrationsPage = lazy(() => import('./pages/club/EventRegistrationsPage.jsx'));

const AdminPage = lazy(() => import('./pages/admin/AdminPage.jsx'));

function RouteFallback() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <RouteError>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<LandingPage />} />

            {/* Public discovery */}
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:slug" element={<EventDetailPage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/:slug" element={<ClubDetailPage />} />

            <Route
              path="login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="signup"
              element={
                <RedirectIfAuthenticated>
                  <SignupPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route path="verify-email" element={<VerifyEmailPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />

            {/* Any signed-in account has a personal record. */}
            <Route element={<RequireAuth />}>
              <Route path="me/registrations" element={<MyRegistrationsPage />} />
              <Route path="pass/:registrationId" element={<EntryPassPage />} />
            </Route>

            <Route element={<RequireAuth roles={['STUDENT']} />}>
              <Route path="dashboard" element={<DashboardPage />} />
            </Route>

            <Route element={<RequireAuth roles={['CLUB_REP', 'ADMIN']} />}>
              <Route path="club" element={<ClubDeskPage />} />
              <Route path="club/:clubId/events" element={<ClubEventsPage />} />
              <Route path="club/:clubId/events/new" element={<EventFormPage />} />
              <Route path="club/events/:eventId/edit" element={<EventFormPage />} />
              <Route
                path="club/events/:eventId/registrations"
                element={<EventRegistrationsPage />}
              />
            </Route>

            <Route element={<RequireAuth roles={['ADMIN']} />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteError>
  );
}
