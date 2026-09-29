import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard, AuthLink } from '../../features/auth/AuthCard.jsx';
import { loginSchema } from '../../features/auth/auth.schemas.js';
import { useAuth } from '../../features/auth/auth.context.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/FormField.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { toApiError } from '../../lib/apiError.js';

const HOME_FOR_ROLE = { STUDENT: '/dashboard', CLUB_REP: '/club', ADMIN: '/admin' };

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);
  // Set by the reset-password flow when it redirects here after a successful change.
  const notice = location.state?.notice ?? null;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const user = await signIn(values);
      // Return them where they were headed before the guard intercepted.
      const target = location.state?.from ?? HOME_FOR_ROLE[user.role] ?? '/';
      navigate(target, { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      const fields = apiError.fieldErrors;
      Object.entries(fields).forEach(([name, message]) => setError(name, { message }));
      if (!Object.keys(fields).length) setFormError(apiError.message);
    }
  };

  return (
    <AuthCard
      kicker="Sign in"
      title="Welcome back"
      intro="Use the college email you signed up with."
      footer={
        <>
          New here? <AuthLink to="/signup">Create an account</AuthLink>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {notice && !formError && <Notice tone="success">{notice}</Notice>}
        {formError && <Notice tone="error">{formError}</Notice>}

        <FormField
          label="College email"
          error={errors.email?.message}
          type="email"
          autoComplete="username"
          placeholder="aarav.sharma@iitb.ac.in"
          {...register('email')}
        />

        <FormField
          label="Password"
          error={errors.password?.message}
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />

        <div className="flex items-center justify-between">
          <Link
            to="/forgot-password"
            className="rounded-xs text-[13px] text-muted underline underline-offset-2 hover:text-ink"
          >
            Forgot your password?
          </Link>
          <Button type="submit" loading={isSubmitting}>
            Sign in
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
