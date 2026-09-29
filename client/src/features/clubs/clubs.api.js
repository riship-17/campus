import { api } from '../../lib/apiClient.js';
import { toQuery } from '../events/events.api.js';

export const clubsApi = {
  list: async (params) => (await api.get(`/clubs${toQuery(params)}`)).data,
  get: async (slug) => (await api.get(`/clubs/${slug}`)).data.data,
  mine: async () => (await api.get('/clubs/mine')).data.data,
  events: async (id, params) => (await api.get(`/clubs/${id}/events${toQuery(params)}`)).data,
  follow: async (id) => (await api.post(`/clubs/${id}/follow`)).data.data,
  unfollow: async (id) => (await api.delete(`/clubs/${id}/follow`)).data.data,
  update: async (id, body) => (await api.patch(`/clubs/${id}`, body)).data.data,
};
