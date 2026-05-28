import type { Plan, PlanSuggestions, Reservation, StoredPlan, TrendingCategories, TrendingNews, User, Venue } from '@/types';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://link-plan-api.onrender.com';
const TOKEN_KEY = 'lp_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

type AuthUserResponse = User & { token?: string };

function consumeAuthResponse(payload: AuthUserResponse): User {
  const { token, ...user } = payload;
  if (token) setToken(token);
  return user as User;
}

export const api = {
  users: () => request<User[]>('/api/users'),
  createUser: (body: Pick<User, 'name' | 'foodTags' | 'activityTags' | 'pace'>) => request<User>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  updateMe: (body: Partial<Pick<User, 'name' | 'description' | 'foodTags' | 'activityTags' | 'pace'>>) =>
    request<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  friends: () => request<User[]>('/api/friends'),
  addFriend: (userId: string) => request<{ ok: true }>(`/api/friends/${userId}`, { method: 'POST' }),
  removeFriend: (userId: string) => request<void>(`/api/friends/${userId}`, { method: 'DELETE' }),
  reservations: () => request<Reservation[]>('/api/reservations'),
  generatePlan: (body: {
    organizerId: string;
    companionIds: string[];
    budgetPerPerson: number;
    date: string;
    zone?: string;
    duration?: 'corto' | 'medio' | 'largo';
    excludeIds?: string[];
    variantSeed?: number;
  }) => request<Plan>('/api/plans/generate', { method: 'POST', body: JSON.stringify(body) }),
  confirmPlan: (body: {
    companionIds: string[];
    budgetPerPerson: number;
    date: string;
    zone?: string;
    duration?: 'corto' | 'medio' | 'largo';
    morningVenueId: string;
    lunchVenueId: string;
    afternoonVenueId: string;
  }) => request<StoredPlan>('/api/plans', { method: 'POST', body: JSON.stringify(body) }),
  myPlans: () => request<StoredPlan[]>('/api/plans/mine'),
  planSuggestions: () => request<PlanSuggestions[]>('/api/plans/mine/suggestions'),
  swapVenue: (planId: string, slot: 'morning' | 'lunch' | 'afternoon', venueId: string) =>
    request<StoredPlan>(`/api/plans/${planId}/swap-venue`, { method: 'POST', body: JSON.stringify({ slot, venueId }) }),
  updatePlan: (id: string, body: { date?: string; zone?: string | null; status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' }) =>
    request<StoredPlan>(`/api/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  completePlan: (id: string) => request<StoredPlan>(`/api/plans/${id}/complete`, { method: 'POST' }),
  deletePlan: (id: string) => request<void>(`/api/plans/${id}`, { method: 'DELETE' }),
  confirmReservation: (planId: string) => request<{ id: string }>('/api/reservations', { method: 'POST', body: JSON.stringify({ planId }) }),
  adminData: () => request<{ restaurants: Venue[]; activities: Venue[]; stats: { plans: number; reservations: number } }>('/api/admin/data'),
  validateUrls: () =>
    request<{ checkedAt: string; total: number; valid: number; broken: number; brokenList: { id: string; name: string; url: string; statusCode: number | null; error: string | null }[] }>(
      '/api/venues/validate-urls',
      { method: 'POST' }
    ),
  trendingCategories: (limit = 3) => request<TrendingCategories>(`/api/trends/categories?limit=${limit}`),
  trendingNews: (limit = 15) => request<TrendingNews>(`/api/trends/news?limit=${limit}`),
  auth: {
    me: () => request<User>('/api/auth/me'),
    logout: async () => {
      try {
        await request<void>('/api/auth/logout', { method: 'POST' });
      } finally {
        setToken(null);
      }
    },
    registerOptions: (body: { username: string; name: string }) => request<unknown>('/api/auth/register/options', { method: 'POST', body: JSON.stringify(body) }),
    registerVerify: async (body: { username: string; name: string; response: unknown }) => {
      const payload = await request<AuthUserResponse>('/api/auth/register/verify', { method: 'POST', body: JSON.stringify(body) });
      return consumeAuthResponse(payload);
    },
    loginOptions: (body: { username: string }) => request<unknown>('/api/auth/login/options', { method: 'POST', body: JSON.stringify(body) }),
    loginVerify: async (body: { username: string; response: unknown }) => {
      const payload = await request<AuthUserResponse>('/api/auth/login/verify', { method: 'POST', body: JSON.stringify(body) });
      return consumeAuthResponse(payload);
    }
  }
};
