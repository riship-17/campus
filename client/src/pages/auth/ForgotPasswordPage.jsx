import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard, AuthLink } from '../../features/auth/AuthCard.jsx';
import { forgotPasswordSchema } from '../../features/auth/auth.schemas.js';
import { api } from '../../lib/apiClient.js';
import { toApiError } from '../../lib/apiError.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/FormField.jsx';
import { Notice } from '../../components/ui/Notice.jsx';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  };

  return (
    <AuthCard
      kicker="Password reset"
      title="Forgot your password"
      intro="We will email a link that lets you set a new one."
      footer={<AuthLink to="/login">Back to sign in</AuthLink>}
    >
      {sent ? (
        <Notice tone="success" title="Check your inbox">
          If that address has an account, a reset link is on its way. It expires in 15 minutes and
          works once.
        </Notice>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {formError && <Notice tone="error">{formError}</Notice>}
          <FormField
            label="College email"
            error={errors.email?.message}
            type="email"
            autoComplete="username"
            placeholder="aarav.sharma@iitb.ac.in"
            {...register('email')}
          />
          <Button type="submit" loading={isSubmitting} className="self-start">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
