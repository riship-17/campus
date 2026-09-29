import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { eventsApi } from '../../features/events/events.api.js';
import {
  EVENT_CATEGORIES,
  eventFormSchema,
  toApiPayload,
  toLocalInput,
} from '../../features/events/event.form.schema.js';
import { DEPARTMENTS } from '../../features/auth/auth.schemas.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/FormField.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { toApiError } from '../../lib/apiError.js';

const YEARS = [1, 2, 3, 4, 5];

const EMPTY = {
  title: '',
  summary: '',
  description: '',
  category: '',
  venue: '',
  startAt: '',
  endAt: '',
  registrationDeadline: '',
  reportingTime: '',
  capacity: 40,
  waitlistEnabled: true,
  requireFeedbackForCertificate: true,
  prerequisites: '',
  eligibilityYears: [],
  eligibilityDepartments: [],
};

export default function EventFormPage() {
  const { clubId, eventId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(eventId);

  /**
   * Editing loads by id, which only the event's own club may read — so a convener who
   * guesses another club's event id gets a 403 here, not a populated form.
   */
  const existing = useQuery({
    queryKey: ['events', 'edit', eventId],
    queryFn: async () => (await api.get(`/events/${eventId}`)).data.data,
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(eventFormSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (!existing.data) return;
    const event = existing.data;
    reset({
      ...EMPTY,
      title: event.title,
      summary: event.summary ?? '',
      description: event.description,
      category: event.category,
      venue: event.venue,
      startAt: toLocalInput(event.startAt),
      endAt: toLocalInput(event.endAt),
      registrationDeadline: toLocalInput(event.registrationDeadline),
      reportingTime: toLocalInput(event.reportingTime),
      capacity: event.capacity,
      waitlistEnabled: event.waitlistEnabled,
      requireFeedbackForCertificate: event.requireFeedbackForCertificate,
      prerequisites: event.prerequisites ?? '',
      eligibilityYears: event.eligibility?.years ?? [],
      eligibilityDepartments: event.eligibility?.departments ?? [],
    });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (payload) =>
      isEdit ? eventsApi.update(eventId, payload) : eventsApi.create({ ...payload, clubId }),
    onSuccess: (event) => {
      toast.show(isEdit ? 'Saved.' : 'Draft saved. Submit it when you are ready.', 'success');
      navigate(`/club/${clubId ?? existing.data?.club?.id}/events`, { replace: true });
      return event;
    },
    onError: (error) => {
      const apiError = toApiError(error);
      const fields = apiError.fieldErrors;
      let mapped = false;
      for (const [name, message] of Object.entries(fields)) {
        // The server nests eligibility; the form flattens it.
        const formName = name.startsWith('eligibility.') ? 'eligibilityYears' : name;
        setError(formName, { message });
        mapped = true;
      }
      if (!mapped) toast.show(apiError.message, 'error');
    },
  });

  // `useWatch` rather than `watch()`: it subscribes properly and stays memoisable.
  const years = useWatch({ control, name: 'eligibilityYears' }) ?? [];
  const departments = useWatch({ control, name: 'eligibilityDepartments' }) ?? [];

  const toggle = (field, current, value) =>
    setValue(
      field,
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
      { shouldDirty: true }
    );

  if (isEdit && existing.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (isEdit && existing.isError) {
    return (
      <Notice tone="error" title="Cannot open this event">
        {existing.error.message}
      </Notice>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-3xl flex-col gap-6"
      onSubmit={handleSubmit((values) => save.mutate(toApiPayload(values)))}
      noValidate
    >
      <header className="border-b border-line pb-4">
        <nav className="kicker mb-2 text-muted">
          <Link to="/club" className="rounded-xs hover:text-ink">
            Club desk
          </Link>
        </nav>
        <h1 className="text-[28px]">{isEdit ? 'Edit event' : 'Post an event'}</h1>
        <p className="mt-1.5 text-[14px] text-muted">
          Saved as a draft first. Nothing is visible to students until the SAC office approves it.
        </p>
      </header>

      <Section title="What it is" number="01">
        <FormField label="Title" error={errors.title?.message} {...register('title')} />

        <FormField
          label="One-line summary"
          hint="Shown on list cards. Leave it blank and we take the first line of the description."
          error={errors.summary?.message}
          {...register('summary')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            as="select"
            label="Category"
            error={errors.category?.message}
            {...register('category')}
          >
            <option value="">Select…</option>
            {EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </FormField>

          <FormField label="Venue" error={errors.venue?.message} {...register('venue')} />
        </div>

        <FormField
          as="textarea"
          rows={8}
          label="Full description"
          hint="Basic HTML is allowed — paragraphs, headings, lists, links. Scripts and styles are stripped."
          error={errors.description?.message}
          {...register('description')}
        />
      </Section>

      <Section title="When" number="02">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            type="datetime-local"
            label="Starts"
            numeric
            error={errors.startAt?.message}
            {...register('startAt')}
          />
          <FormField
            type="datetime-local"
            label="Ends"
            numeric
            error={errors.endAt?.message}
            {...register('endAt')}
          />
          <FormField
            type="datetime-local"
            label="Registration closes"
            numeric
            error={errors.registrationDeadline?.message}
            {...register('registrationDeadline')}
          />
          <FormField
            type="datetime-local"
            label="Report by (optional)"
            hint="Shown prominently on the entry pass."
            numeric
            error={errors.reportingTime?.message}
            {...register('reportingTime')}
          />
        </div>
      </Section>

      <Section title="Who can come" number="03">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            type="number"
            label="Seats"
            numeric
            min={1}
            error={errors.capacity?.message}
            {...register('capacity')}
          />

          <div className="flex flex-col gap-2 pt-5">
            <label className="flex cursor-pointer items-center gap-2 text-[14px]">
              <input type="checkbox" className="accent-brick" {...register('waitlistEnabled')} />
              Keep a waitlist once it fills
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="accent-brick"
                {...register('requireFeedbackForCertificate')}
              />
              Require feedback before issuing a certificate
            </label>
          </div>
        </div>

        <fieldset>
          <legend className="kicker text-muted">Years — leave empty for everyone</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {YEARS.map((year) => (
              <Chip
                key={year}
                selected={years.includes(year)}
                onClick={() => toggle('eligibilityYears', years, year)}
              >
                Year {year}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="kicker text-muted">Departments — leave empty for everyone</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEPARTMENTS.map((department) => (
              <Chip
                key={department}
                selected={departments.includes(department)}
                onClick={() => toggle('eligibilityDepartments', departments, department)}
              >
                {department}
              </Chip>
            ))}
          </div>
        </fieldset>

        <FormField
          as="textarea"
          rows={3}
          label="Prerequisites (optional)"
          hint="What to install, bring, or know beforehand."
          error={errors.prerequisites?.message}
          {...register('prerequisites')}
        />
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper py-3">
        <p className="text-[13px] text-muted">
          {isEdit ? 'Changes save immediately.' : 'Saved as a draft — you submit it separately.'}
        </p>
        <div className="flex gap-2">
          <Link to="/club">
            <Button variant="ghost">Discard</Button>
          </Link>
          <Button type="submit" loading={isSubmitting || save.isPending}>
            {isEdit ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, number, children }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <span className="kicker text-brick" data-numeric>
          {number}
        </span>
        <h2 className="text-[19px]">{title}</h2>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
    </section>
  );
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        selected
          ? 'rounded-xs border border-ink bg-ink px-2 py-1 text-[12px] text-white transition-ui'
          : 'rounded-xs border border-line bg-surface px-2 py-1 text-[12px] text-muted transition-ui hover:border-line-strong hover:text-ink'
      }
    >
      {children}
    </button>
  );
}
