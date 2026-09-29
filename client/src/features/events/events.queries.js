import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi, registrationsApi } from './events.api.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { toApiError } from '../../lib/apiError.js';

/** Query keys in one place so an invalidation cannot miss a cache by typo. */
export const eventKeys = {
  all: ['events'],
  list: (params) => ['events', 'list', params],
  detail: (slug) => ['events', 'detail', slug],
  registrations: (id, params) => ['events', id, 'registrations', params],
  mine: (params) => ['me', 'registrations', params],
  clubRegister: (clubId, params) => ['clubs', clubId, 'events', params],
};

export function useEvents(params) {
  return useQuery({
    queryKey: eventKeys.list(params),
    queryFn: () => eventsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useEvent(slug) {
  return useQuery({
    queryKey: eventKeys.detail(slug),
    queryFn: () => eventsApi.get(slug),
    enabled: Boolean(slug),
  });
}

export function useMyRegistrations(params) {
  return useQuery({
    queryKey: eventKeys.mine(params),
    queryFn: () => registrationsApi.mine(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * Registering is deliberately *not* optimistic. The outcome is genuinely uncertain — you may
 * get a seat, you may land on the waitlist at position 14, you may be too late — and guessing
 * would mean showing someone "You're registered" and taking it back a moment later.
 */
export function useRegister(slug) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (eventId) => eventsApi.register(eventId),
    onSuccess: (data) => {
      toast.show(data.message, 'success');
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(slug) });
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
    },
    onError: (error) => toast.show(toApiError(error).message, 'error'),
  });
}

export function useCancelRegistration(slug) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (eventId) => eventsApi.cancelRegistration(eventId),
    onSuccess: (data) => {
      toast.show(data.message, 'success');
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(slug) });
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
    },
    onError: (error) => toast.show(toApiError(error).message, 'error'),
  });
}
