import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, AuthLink } from '../../features/auth/AuthCard.jsx';
import { resetPasswordSchema } from '../../features/auth/auth.schemas.js';
import { api } from '../../lib/apiClient.js';
import { toApiError } from '../../lib/apiError.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/FormField.jsx';
import { Notice } from '../../components/ui/Notice.jsx';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      navigate('/login', {
        replace: true,
        state: { notice: 'Password updated. Sign in with your new password.' },
      });
    } catch (error) {
      const apiError = toApiError(error);
      const fields = apiError.fieldErrors;
      Object.entries(fields).forEach(([name, message]) => setError(name, { message }));
      if (!Object.keys(fields).length) setFormError(apiError.message);
    }
  };

  if (!token) {
    return (
      <AuthCard kicker="Password reset" title="Set a new password">
        <Notice tone="error" title="No token">
          This page needs the link from your email.{' '}
          <AuthLink to="/forgot-password">Request a new one</AuthLink>.
        </Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      kicker="Password reset"
      title="Set a new password"
      intro="Every device signed in to this account will be signed out."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}

        <FormField
          label="New password"
          error={errors.password?.message}
          hint="At least 10 characters. Avoid your name, roll number, or anything common."
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />

        <FormField
          label="Confirm new password"
          error={errors.confirmPassword?.message}
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />

        <Button type="submit" loading={isSubmitting} className="self-start">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
