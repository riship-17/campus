import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard, AuthLink } from '../../features/auth/AuthCard.jsx';
import { DEPARTMENTS, signupSchema } from '../../features/auth/auth.schemas.js';
import { api } from '../../lib/apiClient.js';
import { toApiError } from '../../lib/apiError.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/FormField.jsx';
import { Notice } from '../../components/ui/Notice.jsx';

const YEARS = [1, 2, 3, 4, 5];

export default function SignupPage() {
  const [sentTo, setSentTo] = useState(null);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', rollNumber: '', department: '', year: '' },
  });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const { data } = await api.post('/auth/register', values);
      setSentTo(data.data.emailSentTo);
    } catch (error) {
      const apiError = toApiError(error);
      const fields = apiError.fieldErrors;
      Object.entries(fields).forEach(([name, message]) => setError(name, { message }));
      if (!Object.keys(fields).length) setFormError(apiError.message);
    }
  };

  if (sentTo) {
    return (
      <AuthCard
        kicker="Check your inbox"
        title="One more step"
        intro="We sent a confirmation link so we know the address is really yours."
      >
        <Notice tone="success" title="Link sent">
          Open the link we sent to <strong>{sentTo}</strong>. It expires in 30 minutes.
        </Notice>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          Nothing in your inbox after a few minutes? Check spam, then{' '}
          <AuthLink to="/login">sign in</AuthLink> and request a fresh link.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      kicker="Create an account"
      title="Sign up"
      intro="Only college addresses can register. You will be asked to confirm yours."
      footer={
        <>
          Already registered? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}

        <FormField
          label="Full name"
          error={errors.name?.message}
          autoComplete="name"
          placeholder="Aarav Sharma"
          {...register('name')}
        />

        <FormField
          label="College email"
          error={errors.email?.message}
          type="email"
          autoComplete="username"
          placeholder="aarav.sharma@iitb.ac.in"
          {...register('email')}
        />

        <FormField
          label="Roll number"
          error={errors.rollNumber?.message}
          numeric
          placeholder="210050114"
          {...register('rollNumber')}
        />

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField
            as="select"
            label="Department"
            error={errors.department?.message}
            {...register('department')}
          >
            <option value="">Select…</option>
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </FormField>

          <FormField as="select" label="Year" error={errors.year?.message} {...register('year')}>
            <option value="">Year</option>
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </FormField>
        </div>

        <FormField
          label="Password"
          error={errors.password?.message}
          hint="At least 10 characters. Avoid your name, roll number, or anything you have used elsewhere."
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting} className="self-start">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
