/**
 * Everything user-facing is rendered in Indian English and Asia/Kolkata, because that is
 * where the campus is. Dates read "Thu 14 Nov, 4:00 PM" — the shape a notice would use.
 */
const TIME_ZONE = 'Asia/Kolkata';

const dayMonth = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: TIME_ZONE,
});

const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const clock = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: TIME_ZONE,
});

const toDate = (value) => (value instanceof Date ? value : new Date(value));

const isThisYear = (date) => date.getFullYear() === new Date().getFullYear();

/** "Thu 14 Nov, 4:00 PM" — or with the year once it stops being obvious. */
export function formatDateTime(value) {
  const date = toDate(value);
  const datePart = isThisYear(date) ? dayMonth.format(date) : dayMonthYear.format(date);
  return `${datePart}, ${clock.format(date)}`;
}

export function formatDate(value) {
  const date = toDate(value);
  return isThisYear(date) ? dayMonth.format(date) : dayMonthYear.format(date);
}

export function formatTime(value) {
  return clock.format(toDate(value));
}

/** "4:00 PM – 6:30 PM" when it is one day, otherwise both dates in full. */
export function formatRange(start, end) {
  const from = toDate(start);
  const to = toDate(end);

  const sameDay =
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth() &&
    from.getDate() === to.getDate();

  return sameDay
    ? `${formatDateTime(from)} – ${clock.format(to)}`
    : `${formatDateTime(from)} – ${formatDateTime(to)}`;
}

/** The three parts of a tear-off calendar block. */
export function calendarParts(value) {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
    timeZone: TIME_ZONE,
  }).formatToParts(date);

  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    month: pick('month').toUpperCase(),
    day: pick('day'),
    weekday: pick('weekday').toUpperCase(),
  };
}

/**
 * "Closes in 3 days", "Closes in 4 hours", "Closed".
 * Deadlines are the single most actionable thing on a card, so they get plain words
 * rather than a raw timestamp the reader has to do arithmetic on.
 */
export function deadlineLabel(value) {
  const remaining = toDate(value).getTime() - Date.now();
  if (remaining <= 0) return { text: 'Registration closed', urgent: false, closed: true };

  const hours = remaining / 3_600_000;
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(remaining / 60_000));
    return { text: `Closes in ${minutes} min`, urgent: true, closed: false };
  }
  if (hours < 24) {
    const rounded = Math.round(hours);
    return {
      text: `Closes in ${rounded} hour${rounded === 1 ? '' : 's'}`,
      urgent: true,
      closed: false,
    };
  }

  const days = Math.round(hours / 24);
  return {
    text: `Closes ${formatDate(value)}`,
    urgent: days <= 2,
    closed: false,
    detail: `in ${days} day${days === 1 ? '' : 's'}`,
  };
}

export function pluralise(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
