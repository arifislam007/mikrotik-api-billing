const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080/api' : '/api');

const parseError = async (response) => {
  try {
    const data = await response.json();
    return data?.error || 'Network response was not ok';
  } catch {
    return 'Network response was not ok';
  }
};

const api = {
  get: async (path) => {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  post: async (path, data) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  put: async (path, data) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  delete: async (path) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },
};

export const userService = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const billingService = {
  getAll: () => api.get('/billing'),
  create: (data) => api.post('/billing', data),
  update: (id, data) => api.put(`/billing/${id}`, data),
  delete: (id) => api.delete(`/billing/${id}`),
};

export const resellerService = {
  getAll: () => api.get('/resellers'),
  create: (data) => api.post('/resellers', data),
  update: (id, data) => api.put(`/resellers/${id}`, data),
  delete: (id) => api.delete(`/resellers/${id}`),
};

export const locationService = {
  getAll: () => api.get('/locations'),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`),
};

export const statsService = {
  getStats: () => api.get('/stats'),
  getReport: () => api.get('/stats/report'),
};

export const mikrotikService = {
  getServers: () => api.get('/mikrotik/servers'),
  getProfiles: (id) => api.get(`/mikrotik/servers/${id}/profiles`),
  createServer: (data) => api.post('/mikrotik/servers', data),
  updateServer: (id, data) => api.put(`/mikrotik/servers/${id}`, data),
  deleteServer: (id) => api.delete(`/mikrotik/servers/${id}`),
  testServer: (id) => api.post(`/mikrotik/servers/${id}/test`, {}),
  importUsers: (id) => api.post(`/mikrotik/servers/${id}/import-users`, {}),
  syncUsers: (id, direction = 'both') => api.post(`/mikrotik/servers/${id}/sync`, { direction }),
};