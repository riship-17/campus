import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from './clubs.api.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { toApiError } from '../../lib/apiError.js';

export const clubKeys = {
  all: ['clubs'],
  list: (params) => ['clubs', 'list', params],
  detail: (slug) => ['clubs', 'detail', slug],
  mine: ['clubs', 'mine'],
};

export function useClubs(params) {
  return useQuery({
    queryKey: clubKeys.list(params),
    queryFn: () => clubsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useClub(slug) {
  return useQuery({
    queryKey: clubKeys.detail(slug),
    queryFn: () => clubsApi.get(slug),
    enabled: Boolean(slug),
  });
}

export function useMyClubs() {
  return useQuery({ queryKey: clubKeys.mine, queryFn: clubsApi.mine });
}

/**
 * Following *is* optimistic: the outcome is never in doubt and the button should feel
 * instant. On failure the previous cache snapshot is put back, so a dropped connection
 * leaves a correct-looking button rather than a lie.
 */
export function useToggleFollow(slug) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ clubId, isFollowing }) =>
      isFollowing ? clubsApi.unfollow(clubId) : clubsApi.follow(clubId),

    onMutate: async ({ isFollowing }) => {
      const key = clubKeys.detail(slug);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (club) =>
        club
          ? {
              ...club,
              isFollowing: !isFollowing,
              followersCount: club.followersCount + (isFollowing ? -1 : 1),
            }
          : club
      );

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(clubKeys.detail(slug), context.previous);
      toast.show(toApiError(error).message, 'error');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clubKeys.detail(slug) });
      queryClient.invalidateQueries({ queryKey: ['clubs', 'list'] });
    },
  });
}
