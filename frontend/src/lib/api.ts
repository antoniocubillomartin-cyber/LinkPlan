import type { Plan, Reservation, User, Venue } from '@/types';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://link-plan-api.onrender.com';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.message ?? 'Request failed') as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  users: () => request<User[]>('/api/users'),
  createUser: (body: Pick<User, 'name' | 'foodTags' | 'activityTags' | 'pace'>) => request<User>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  reservations: () => request<Reservation[]>('/api/reservations'),
  generatePlan: (body: { organizerId: string; companionIds: string[]; budgetPerPerson: number; date: string; zone?: string }) =>
    request<Plan>('/api/plans/generate', { method: 'POST', body: JSON.stringify(body) }),
  confirmReservation: (planId: string) => request<{ id: string }>('/api/reservations', { method: 'POST', body: JSON.stringify({ planId }) }),
  adminData: () => request<{ restaurants: Venue[]; activities: Venue[]; stats: { plans: number; reservations: number } }>('/api/admin/data'),
  auth: {
    me: () => request<User>('/api/auth/me'),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
    registerOptions: (body: { username: string; name: string }) => request<unknown>('/api/auth/register/options', { method: 'POST', body: JSON.stringify(body) }),
    registerVerify: (body: { username: string; name: string; response: unknown }) => request<User>('/api/auth/register/verify', { method: 'POST', body: JSON.stringify(body) }),
    loginOptions: (body: { username: string }) => request<unknown>('/api/auth/login/options', { method: 'POST', body: JSON.stringify(body) }),
    loginVerify: (body: { username: string; response: unknown }) => request<User>('/api/auth/login/verify', { method: 'POST', body: JSON.stringify(body) })
  }
};
