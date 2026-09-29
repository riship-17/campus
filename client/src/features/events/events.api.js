import { api } from '../../lib/apiClient.js';

/** Drops empty values so the query string stays short and shareable. */
export function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const eventsApi = {
  list: async (params) => (await api.get(`/events${toQuery(params)}`)).data,
  get: async (slug) => (await api.get(`/events/${slug}`)).data.data,
  create: async (body) => (await api.post('/events', body)).data.data,
  update: async (id, body) => (await api.patch(`/events/${id}`, body)).data.data,
  publish: async (id) => (await api.post(`/events/${id}/publish`)).data.data,
  cancel: async (id, reason) => (await api.post(`/events/${id}/cancel`, { reason })).data.data,
  approve: async (id, body) => (await api.patch(`/events/${id}/approve`, body)).data.data,

  register: async (id) => (await api.post(`/events/${id}/register`)).data.data,
  cancelRegistration: async (id) => (await api.delete(`/events/${id}/register`)).data.data,

  registrations: async (id, params) =>
    (await api.get(`/events/${id}/registrations${toQuery(params)}`)).data,

  /**
   * The CSV download is fetched as a blob rather than linked directly, because the export
   * endpoint needs the Authorization header and a plain <a href> cannot carry one.
   */
  downloadRegistrationsCsv: async (id, filename) => {
    const response = await api.get(`/events/${id}/registrations.csv`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export const registrationsApi = {
  mine: async (params) => (await api.get(`/me/registrations${toQuery(params)}`)).data,
};
