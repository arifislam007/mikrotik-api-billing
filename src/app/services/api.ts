const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080/api' : '/api');

const getToken = () => localStorage.getItem("auth_token");

const parseError = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error || 'Network response was not ok';
  } catch {
    return 'Network response was not ok';
  }
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const api = {
  get: async (path: string) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { ...authHeaders() },
    });
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  post: async (path: string, data?: unknown) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  put: async (path: string, data?: unknown) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },

  delete: async (path: string) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  },
};

export const authService = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    api.put('/auth/password', { current_password, new_password }),
};

export const userService = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: unknown) => api.post('/users', data),
  update: (id: string, data: unknown) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const billingService = {
  getAll: () => api.get('/billing'),
  create: (data: unknown) => api.post('/billing', data),
  update: (id: string, data: unknown) => api.put(`/billing/${id}`, data),
  delete: (id: string) => api.delete(`/billing/${id}`),
};

export const resellerService = {
  getAll: () => api.get('/resellers'),
  create: (data: unknown) => api.post('/resellers', data),
  update: (id: string, data: unknown) => api.put(`/resellers/${id}`, data),
  delete: (id: string) => api.delete(`/resellers/${id}`),
  getCredentials: (id: string) => api.get(`/resellers/${id}/credentials`),
  setCredentials: (id: string, data: unknown) => api.post(`/resellers/${id}/credentials`, data),
};

export const locationService = {
  getAll: () => api.get('/locations'),
  create: (data: unknown) => api.post('/locations', data),
  update: (id: string, data: unknown) => api.put(`/locations/${id}`, data),
  delete: (id: string) => api.delete(`/locations/${id}`),
};

export const statsService = {
  getStats: () => api.get('/stats'),
  getReport: () => api.get('/stats/report'),
};

export const mikrotikService = {
  getServers: () => api.get('/mikrotik/servers'),
  getProfiles: (id: string) => api.get(`/mikrotik/servers/${id}/profiles`),
  createServer: (data: unknown) => api.post('/mikrotik/servers', data),
  updateServer: (id: string, data: unknown) => api.put(`/mikrotik/servers/${id}`, data),
  deleteServer: (id: string) => api.delete(`/mikrotik/servers/${id}`),
  testServer: (id: string) => api.post(`/mikrotik/servers/${id}/test`, {}),
  importUsers: (id: string) => api.post(`/mikrotik/servers/${id}/import-users`, {}),
  syncUsers: (id: string, direction = 'both') => api.post(`/mikrotik/servers/${id}/sync`, { direction }),
};

export const packageService = {
  getAll: () => api.get('/packages'),
  create: (data: unknown) => api.post('/packages', data),
  update: (id: string, data: unknown) => api.put(`/packages/${id}`, data),
  delete: (id: string) => api.delete(`/packages/${id}`),
};

export const resellerPortalService = {
  getStats: () => api.get('/reseller/stats'),
  getUsers: () => api.get('/reseller/users'),
  createUser: (data: unknown) => api.post('/reseller/users', data),
  changeUserPackage: (userId: string, data: unknown) => api.put(`/reseller/users/${userId}/package`, data),
  getBilling: () => api.get('/reseller/billing'),
  createInvoice: (data: unknown) => api.post('/reseller/billing', data),
  payInvoice: (id: string, data: unknown) => api.put(`/reseller/billing/${id}/pay`, data),
  syncMikroTik: (data: unknown) => api.post('/reseller/sync', data),
};
