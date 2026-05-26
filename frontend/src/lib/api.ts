import type { Plan, Reservation, User, Venue } from '@/types';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? 'Request failed');
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
  adminData: () => request<{ restaurants: Venue[]; activities: Venue[]; stats: { plans: number; reservations: number } }>('/api/admin/data')
};
