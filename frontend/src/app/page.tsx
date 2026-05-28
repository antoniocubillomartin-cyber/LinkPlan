'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { LoginScreen } from '@/components/LoginScreen';
import { ProfilePanel } from '@/components/ProfilePanel';
import { FriendsPanel } from '@/components/FriendsPanel';
import { OnboardingGustos } from '@/components/OnboardingGustos';
import { useAuth } from '@/lib/authContext';
import { buildTimeline, formatDuration } from '@/lib/timeline';
import type { Plan, PlanSuggestion, PlanSuggestions, StoredPlan, TrendingEvent, User, Venue } from '@/types';

const DURATIONS = [
  { value: 'corto', label: 'Corto · 1 plan (~1-2h)' },
  { value: 'medio', label: 'Medio · 2 planes (~2-4h)' },
  { value: 'largo', label: 'Largo · 3 planes (~4-6h)' }
] as const;
const ZONES = ['', 'Centro', 'Retiro', 'Malasaña', 'Chamberí', 'La Latina'];

type Tab = 'perfil' | 'amigos' | 'planes' | 'generar' | 'sitios' | 'news';

export default function Home() {
  const { user: authUser, loading: authLoading, logout, setUser } = useAuth();

  if (authLoading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white p-2 shadow-lg animate-pulse">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_vector.png" alt="Gatos y Cañas" className="h-full w-full object-contain" />
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#2F6FBF]">GATOS Y CAÑAS</p>
          <p className="mt-1 display text-lg text-[#0A2E6E]">Preparando tu sesión…</p>
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-[#D8E3F2]">
          <div className="h-full w-1/2 animate-loader bg-[#0E4DA4]" />
        </div>
      </main>
    );
  }

  if (!authUser) return <LoginScreen />;

  const needsOnboarding = (authUser.foodTags?.length ?? 0) === 0 && (authUser.activityTags?.length ?? 0) === 0;
  if (needsOnboarding) {
    return (
      <OnboardingGustos
        me={authUser}
        onComplete={async (patch) => {
          const updated = await api.updateMe(patch);
          setUser(updated);
        }}
      />
    );
  }

  return <App authUser={authUser} onLogout={logout} />;
}

function App({ authUser, onLogout }: { authUser: User; onLogout: () => Promise<void> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [myPlans, setMyPlans] = useState<StoredPlan[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, PlanSuggestion[]>>({});
  const [news, setNews] = useState<TrendingEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [newsError, setNewsError] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [favorites, setFavorites] = useState<Venue[]>([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Tab>('perfil');
  const [friends, setFriends] = useState<User[]>([]);
  const [me, setMe] = useState<User>(authUser);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [duration, setDuration] = useState<'corto' | 'medio' | 'largo'>('medio');

  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState(50);
  const [zone, setZone] = useState('');

  const companions = useMemo(() => friends, [friends]);
  const favoriteIds = useMemo(() => new Set(favorites.map((v) => v.id)), [favorites]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, adminData, mine, friendsData, sugg, favs] = await Promise.all([
        api.users(),
        api.adminData(),
        api.myPlans().catch(() => []),
        api.friends().catch(() => []),
        api.planSuggestions().catch(() => [] as PlanSuggestions[]),
        api.favorites().catch(() => [] as Venue[])
      ]);
      setUsers(usersData);
      setVenues([...adminData.restaurants, ...adminData.activities]);
      setMyPlans(mine);
      setFriends(friendsData);
      setFavorites(favs);
      setSuggestions(Object.fromEntries(sugg.map((s) => [s.planId, s.suggestions])));
      const refreshedMe = usersData.find((u) => u.id === authUser.id);
      if (refreshedMe) setMe(refreshedMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [authUser.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (active !== 'news' || newsLoaded || newsLoading) return;
    setNewsLoading(true);
    setNewsError(false);
    api
      .trendingNews(15)
      .then((data) => {
        setNews(data.items ?? []);
        if (data.error) setNewsError(true);
      })
      .catch(() => setNewsError(true))
      .finally(() => {
        setNewsLoading(false);
        setNewsLoaded(true);
      });
  }, [active, newsLoaded, newsLoading]);

  function toggleTag(value: string, selected: string[], setter: (next: string[]) => void) {
    setter(selected.includes(value) ? selected.filter((t) => t !== value) : [...selected, value]);
  }

  async function toggleFavorite(venueId: string) {
    setError(null);
    const wasFav = favoriteIds.has(venueId);
    try {
      if (wasFav) await api.removeFavorite(venueId);
      else await api.addFavorite(venueId);
      const next = await api.favorites();
      setFavorites(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar tus sitios');
    }
  }

  async function createPlan(opts?: { excludeIds?: string[] }) {
    setSaving(true);
    setError(null);
    try {
      const nextPlan = await api.generatePlan({
        organizerId: authUser.id,
        companionIds,
        budgetPerPerson: budget,
        date,
        zone,
        duration,
        excludeIds: opts?.excludeIds,
        variantSeed: opts?.excludeIds ? Date.now() % 1000 : 0
      });
      setPlan(nextPlan);
      setActive('generar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el plan');
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePlan() {
    if (!plan) return;
    const excludeIds = [plan.morning?.id, plan.lunch.id, plan.afternoon?.id].filter((id): id is string => Boolean(id));
    await createPlan({ excludeIds });
  }

  async function deletePlan(id: string) {
    if (!confirm('¿Borrar este plan?')) return;
    await api.deletePlan(id);
    if (expandedPlanId === id) setExpandedPlanId(null);
    await refresh();
  }

  async function completePlan(id: string) {
    await api.completePlan(id);
    await refresh();
  }

  async function changePlanDate(id: string, newDate: string) {
    await api.updatePlan(id, { date: newDate });
    await refresh();
  }

  async function applySuggestion(planId: string, s: PlanSuggestion) {
    setError(null);
    try {
      await api.swapVenue(planId, s.slot, s.alternativeVenueId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la sugerencia');
    }
  }

  async function saveProfile(patch: Partial<Pick<User, 'name' | 'description' | 'foodTags' | 'activityTags'>>) {
    const updated = await api.updateMe(patch);
    setMe(updated);
    await refresh();
  }

  async function toggleFriend(userId: string) {
    const isFriend = friends.some((f) => f.id === userId);
    if (isFriend) await api.removeFriend(userId);
    else await api.addFriend(userId);
    const next = await api.friends();
    setFriends(next);
  }

  async function savePlan() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.confirmPlan({
        companionIds,
        budgetPerPerson: budget,
        date,
        zone,
        duration,
        morningVenueId: plan.morning?.id ?? null,
        lunchVenueId: plan.lunch.id,
        afternoonVenueId: plan.afternoon?.id ?? null
      });
      await refresh();
      setPlan(null);
      setExpandedPlanId(saved.id);
      setActive('planes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar el plan');
    } finally {
      setSaving(false);
    }
  }

  async function reservePlan(id: string) {
    setError(null);
    try {
      await api.confirmReservation(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar el plan');
    }
  }

  const inputCls =
    'mt-1 w-full rounded-xl border border-[#CFE0F3] bg-white p-2.5 outline-none transition focus:border-[#0E4DA4] focus:ring-2 focus:ring-[#0E4DA4]/15';

  const filteredVenues = venues.filter((v) => {
    if (!siteSearch.trim()) return true;
    const q = siteSearch.toLowerCase();
    return v.name.toLowerCase().includes(q) || v.zone.toLowerCase().includes(q) || v.tags.some((t) => t.includes(q));
  });

  function VenueRow({ v }: { v: Venue }) {
    const fav = favoriteIds.has(v.id);
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D8E3F2] bg-white p-3 transition hover:border-[#3B82D6]">
        <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
          <p className="truncate font-medium">{v.type === 'RESTAURANT' ? '🍽️' : '🎟️'} {v.name}</p>
          <p className="truncate text-xs text-[#5B6B82]">{v.zone} · {v.price === 0 ? 'Gratis' : `${v.price}€`}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {v.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-[#E3ECF8] px-2 py-0.5 text-[10px] font-medium text-[#3A5378]">{t}</span>
            ))}
          </div>
        </a>
        <button
          type="button"
          onClick={() => void toggleFavorite(v.id)}
          title={fav ? 'Quitar de mis sitios' : 'Guardar en mis sitios'}
          className={`shrink-0 rounded-full px-2 py-1 text-xl transition ${fav ? 'text-[#0E4DA4]' : 'text-[#B7C6DD] hover:text-[#0E4DA4]'}`}
        >
          {fav ? '♥' : '♡'}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#D8E3F2] bg-white/95 shadow-xl shadow-[#0A2E6E]/10 backdrop-blur">
        <header className="relative flex flex-col items-center gap-2 border-b border-[#D8E3F2] bg-gradient-to-b from-[#EAF1FB] to-white px-6 py-7 text-center">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_vector.png" alt="Gatos y Cañas" className="h-[10.5rem] w-auto object-contain drop-shadow-sm" />
            <span className="display text-4xl font-bold tracking-wide text-[#0A2E6E]">Gatos y Cañas</span>
          </div>
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-[#0E4DA4] via-[#3B82D6] to-[#0A2E6E]" />
        </header>
        <div className="grid min-h-[80vh] grid-cols-1 lg:grid-cols-[264px_1fr]">
          <aside className="flex flex-col border-b border-[#D8E3F2] bg-[#F5F9FE] p-5 lg:border-b-0 lg:border-r">
            <div className="grid gap-1.5">
              {([
                ['perfil', 'Mi perfil', '🐱'],
                ['amigos', 'Mis amigos', '👥'],
                ['planes', 'Mis planes', '🗓️'],
                ['generar', 'Generar plan', '✨'],
                ['sitios', 'Mis sitios', '📍'],
                ['news', 'Noticias', '🔥']
              ] as const).map(([key, label, icon]) => (
                <button
                  key={key}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    active === key
                      ? 'bg-[#0A2E6E] text-white shadow-sm shadow-[#0A2E6E]/30'
                      : 'text-[#43577A] hover:bg-[#E3ECF8]'
                  }`}
                  onClick={() => setActive(key)}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-auto pt-6 border-t border-[#D8E3F2] mt-6">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: authUser.color }}
                >
                  {authUser.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{authUser.name}</p>
                  <p className="truncate text-xs text-[#5B6B82]">@{authUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => void onLogout()}
                className="mt-3 w-full rounded-lg border border-[#D8E3F2] px-3 py-2 text-xs text-[#43577A] hover:bg-[#EAF1FB]"
              >
                Cerrar sesión
              </button>
            </div>
          </aside>

          <section className="p-6">
            {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            {loading ? <p className="text-sm text-[#5B6B82]">Cargando datos...</p> : null}

            {active === 'perfil' ? <ProfilePanel me={me} onSave={(patch) => void saveProfile(patch)} /> : null}

            {active === 'amigos' ? (
              <FriendsPanel me={me} friends={friends} allUsers={users} onToggleFriend={(uid) => void toggleFriend(uid)} />
            ) : null}

            {active === 'generar' ? (
              <div className="grid animate-in gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-[#D8E3F2] bg-white p-5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <h2 className="display text-lg font-semibold">Generador de planes</h2>
                  </div>
                  <div className="rounded-xl border border-[#CFE0F3] bg-[#EAF1FB] p-3 text-xs text-[#3A5378]">
                    Organizado por <strong>{authUser.name}</strong> (tú) · elige acompañantes abajo
                  </div>
                  <label className="block text-sm">
                    Fecha
                    <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    Presupuesto por persona (€)
                    <input type="number" min={10} max={500} className={inputCls} value={budget} onChange={(e) => setBudget(Number(e.target.value || 50))} />
                  </label>
                  <label className="block text-sm">
                    Zona
                    <select className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)}>
                      {ZONES.map((z) => (
                        <option key={z} value={z}>{z || 'Sin preferencia'}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Duración
                    <select className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
                      {DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="mb-1 text-sm">Acompañantes</p>
                    {companions.length === 0 ? (
                      <p className="rounded-lg bg-[#EAF1FB] p-3 text-xs text-[#5B6B82]">
                        Solo puedes invitar a tus amigos. Añade amigos en <strong>Mis amigos</strong> para incluirlos aquí.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {companions.map((u) => {
                          const picked = companionIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleTag(u.id, companionIds, setCompanionIds)}
                              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                                picked ? 'border-[#0A2E6E] bg-[#0A2E6E] text-white' : 'border-[#CFE0F3] hover:border-[#0E4DA4] hover:text-[#0E4DA4]'
                              }`}
                            >
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: u.color }} />
                              {u.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={saving}
                    className="w-full rounded-xl bg-gradient-to-r from-[#0E4DA4] to-[#3B82D6] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                    onClick={() => void createPlan()}
                  >
                    {saving ? 'Generando…' : '✨ Generar Plan'}
                  </button>
                </div>
                <div className="rounded-2xl border border-[#D8E3F2] bg-white p-5">
                  {!plan ? (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-[#C7D8EE] bg-[#F5F9FE] p-8 text-center">
                      <p className="text-3xl">🗺️</p>
                      <p className="mt-2 font-medium">Tu itinerario aparecerá aquí</p>
                      <p className="text-sm text-[#5B6B82]">Configura el plan a la izquierda y pulsa Generar.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="display text-xl">Plan para {plan.allUsers.map((u) => u.name).join(' & ')}</h3>
                        <span className="rounded-full bg-[#EAF1FB] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#0E4DA4]">Borrador</span>
                      </div>

                      <div className="rounded-lg bg-[#EAF1FB] p-3 text-xs">
                        <p>
                          <strong>{plan.totalCost.toFixed(0)}€</strong> / {plan.totalPeople} {plan.totalPeople === 1 ? 'persona' : 'personas'} ={' '}
                          <strong>{(plan.totalCost / plan.totalPeople).toFixed(0)}€</strong> por cabeza
                        </p>
                        <p className="text-[#5B6B82]">Presupuesto: {plan.totalBudget.toFixed(0)}€ · Sobran {plan.remainingBudget.toFixed(0)}€</p>
                      </div>

                      {(() => {
                        const { items, totalMin } = buildTimeline(plan);
                        const venueBySlot: Record<'morning' | 'lunch' | 'afternoon', Venue | null> = {
                          morning: plan.morning,
                          lunch: plan.lunch,
                          afternoon: plan.afternoon
                        };
                        return (
                          <div className="space-y-1">
                            {items.map((it) => {
                              const venue = venueBySlot[it.slot];
                              if (!venue) return null;
                              return (
                                <div key={it.slot} className="flex items-baseline gap-2">
                                  <span className="w-24 shrink-0 font-mono text-xs text-[#5B6B82]">{it.start}–{it.end}</span>
                                  <a className="hover:underline" href={venue.url} target="_blank" rel="noreferrer">
                                    {it.label.split(' ')[0]} {venue.name}
                                  </a>
                                </div>
                              );
                            })}
                            <p className="pt-1 text-xs text-[#5B6B82]">Duración total: {formatDuration(totalMin)}</p>
                          </div>
                        );
                      })()}

                      <div className="flex gap-2">
                        <button disabled={saving} className="flex-1 rounded-lg bg-[#0E4DA4] px-4 py-2 font-medium text-white disabled:opacity-50" onClick={() => void savePlan()}>
                          {saving ? 'Guardando…' : 'Confirmar plan'}
                        </button>
                        <button disabled={saving} className="rounded-lg border border-[#D8E3F2] px-4 py-2 text-sm hover:bg-[#EAF1FB] disabled:opacity-50" onClick={() => void regeneratePlan()}>
                          Otra opción
                        </button>
                      </div>
                      <p className="text-center text-[11px] text-[#5B6B82]">No se guarda hasta que confirmes.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {active === 'planes' ? (
              <div className="animate-in space-y-3">
                <div>
                  <h1 className="text-2xl font-semibold">Mis planes</h1>
                  <p className="mt-0.5 text-sm text-[#5B6B82]">{myPlans.length} {myPlans.length === 1 ? 'plan' : 'planes'} guardado{myPlans.length === 1 ? '' : 's'}</p>
                </div>
                {myPlans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#C7D8EE] bg-[#F5F9FE] p-10 text-center">
                    <p className="text-3xl">🗓️</p>
                    <p className="mt-2 font-medium">Aún no tienes planes guardados</p>
                    <p className="text-sm text-[#5B6B82]">Crea uno en <strong>Generar plan</strong> y confírmalo para verlo aquí.</p>
                    <button
                      className="mt-4 rounded-xl bg-[#0A2E6E] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
                      onClick={() => setActive('generar')}
                    >
                      ✨ Generar un plan
                    </button>
                  </div>
                ) : null}
                {myPlans.map((p) => {
                  const isExpanded = expandedPlanId === p.id;
                  const isOrganizer = p.organizerId === authUser.id;
                  const planSuggestions = suggestions[p.id] ?? [];
                  const statusLabel = p.status === 'COMPLETED' ? '✅ Completado' : p.status === 'CANCELLED' ? '✖ Cancelado' : '🟢 Activo';
                  return (
                    <article key={p.id} className={`rounded-2xl border bg-white p-4 text-sm transition ${isExpanded ? 'border-[#0E4DA4] shadow-md shadow-[#0E4DA4]/10' : 'border-[#D8E3F2] hover:border-[#3B82D6]'} ${p.status === 'COMPLETED' ? 'opacity-70' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="display text-lg font-semibold">{new Date(p.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                            {p.reservation ? (
                              <span className="rounded-full bg-[#2E7D52] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                                Reservado · {p.reservation.code}
                              </span>
                            ) : null}
                            {planSuggestions.length > 0 ? (
                              <span className="rounded-full bg-[#0E4DA4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                                🔥 {planSuggestions.length} mejora{planSuggestions.length > 1 ? 's' : ''}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-[#5B6B82]">{statusLabel} · {p.participants.map((pp) => pp.user.name).join(', ')}</p>
                          <p className="mt-1 truncate text-xs text-[#43577A]">
                            {[
                              p.morningVenue ? `🌅 ${p.morningVenue.name}` : null,
                              `🍽️ ${p.lunchVenue.name}`,
                              p.afternoonVenue ? `☀️ ${p.afternoonVenue.name}` : null
                            ].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <span className="text-xs text-[#5B6B82]">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded ? (
                        <div className="mt-4 space-y-4 border-t border-[#D8E3F2] pt-4">
                          <div className="grid gap-3 sm:grid-cols-3">
                            {([['🌅', 'Mañana', p.morningVenue], ['🍽️', 'Comida', p.lunchVenue], ['☀️', 'Tarde', p.afternoonVenue]] as const).map(([emoji, label, venue]) =>
                              venue ? (
                                <div key={label} className="rounded-lg bg-[#EAF1FB] p-3">
                                  <p className="text-xs uppercase tracking-wider text-[#5B6B82]">{emoji} {label}</p>
                                  <a className="mt-1 block font-medium hover:underline" href={venue.url} target="_blank" rel="noreferrer">{venue.name} ↗</a>
                                  <p className="mt-1 text-xs text-[#5B6B82]">{venue.zone} · {venue.price === 0 ? 'Gratis' : `${venue.price}€`}</p>
                                  <p className="text-xs text-[#5B6B82]">{venue.schedule}</p>
                                </div>
                              ) : null
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#43577A]">
                            <span>
                              Coste: <strong>{p.totalCost.toFixed(0)}€</strong> / {p.participants.length} {p.participants.length === 1 ? 'persona' : 'personas'} ={' '}
                              <strong>{(p.totalCost / p.participants.length).toFixed(0)}€</strong> pp
                            </span>
                            <span>Presupuesto: <strong>{p.totalBudget.toFixed(0)}€</strong></span>
                            <span>Zona: <strong>{p.zone || 'libre'}</strong></span>
                            {p.reservation ? <span>Reserva: <strong>{p.reservation.code}</strong></span> : null}
                          </div>

                          {(() => {
                            const { items, totalMin } = buildTimeline({ pace: p.pace, morning: p.morningVenue, lunch: p.lunchVenue, afternoon: p.afternoonVenue });
                            return (
                              <div className="rounded-lg border border-[#D8E3F2] p-3">
                                <p className="mb-2 text-xs font-medium text-[#43577A]">Horario sugerido · {formatDuration(totalMin)}</p>
                                <div className="space-y-1 text-xs">
                                  {items.map((it) => (
                                    <div key={it.slot} className="flex items-baseline gap-2">
                                      <span className="w-24 shrink-0 font-mono text-[#5B6B82]">{it.start}–{it.end}</span>
                                      <span>{it.label} · {it.venueName}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {planSuggestions.length > 0 ? (
                            <div className="rounded-lg border border-[#C7D8EE] bg-[#EAF1FB] p-3">
                              <p className="text-xs font-semibold text-[#0E4DA4]">🔥 Mejores opciones para tus gustos</p>
                              <p className="mt-0.5 text-[11px] text-[#43577A]">Sugerencias según los gustos de los participantes. Tú decides si las aplicas.</p>
                              <div className="mt-2 space-y-2">
                                {planSuggestions.map((s) => {
                                  const slotLabel = s.slot === 'morning' ? '🌅 Mañana' : s.slot === 'lunch' ? '🍽️ Comida' : '☀️ Tarde';
                                  return (
                                    <div key={s.slot} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2">
                                      <div className="min-w-0 text-xs">
                                        <p className="text-[10px] uppercase tracking-wider text-[#5B6B82]">{slotLabel}</p>
                                        <p className="truncate">
                                          <span className="line-through text-[#5B6B82]">{s.currentVenueName}</span>
                                          {' → '}
                                          <strong>{s.alternativeVenueName}</strong>
                                        </p>
                                        <p className="text-[10px] text-[#2E7D52]">
                                          {s.scoreImprovement} de afinidad
                                          {s.priceDelta !== 0 ? ` · ${s.priceDelta > 0 ? '+' : ''}${s.priceDelta}€/persona` : ' · mismo precio'}
                                        </p>
                                      </div>
                                      <button
                                        className="rounded-lg bg-[#0E4DA4] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                        disabled={p.status !== 'ACTIVE'}
                                        onClick={() => void applySuggestion(p.id, s)}
                                      >
                                        Aplicar
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-xs">
                              Cambiar fecha
                              <input
                                type="date"
                                defaultValue={p.date.slice(0, 10)}
                                disabled={p.status !== 'ACTIVE'}
                                className="mt-1 w-full rounded-lg border border-[#CFE0F3] p-2 disabled:opacity-50"
                                onBlur={(e) => {
                                  if (e.target.value && e.target.value !== p.date.slice(0, 10)) void changePlanDate(p.id, e.target.value);
                                }}
                              />
                            </label>
                            <div className="flex flex-col justify-end gap-2">
                              {p.status === 'ACTIVE' && !p.reservation ? (
                                <button className="rounded-lg bg-[#0E4DA4] px-3 py-2 text-xs font-medium text-white" onClick={() => void reservePlan(p.id)}>
                                  Reservar
                                </button>
                              ) : null}
                              {p.status === 'ACTIVE' ? (
                                <button className="rounded-lg bg-[#2E7D52] px-3 py-2 text-xs font-medium text-white" onClick={() => void completePlan(p.id)}>
                                  Marcar como completado
                                </button>
                              ) : null}
                              {isOrganizer ? (
                                <button className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50" onClick={() => void deletePlan(p.id)}>
                                  Eliminar plan
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {active === 'sitios' ? (
              <div className="animate-in space-y-5">
                <div>
                  <h1 className="text-2xl font-semibold">Mis sitios</h1>
                  <p className="mt-0.5 text-sm text-[#5B6B82]">Guarda tus lugares favoritos de Madrid con ♥ para tenerlos a mano.</p>
                </div>

                <section>
                  <p className="mb-2 text-sm font-semibold">Tus favoritos ({favorites.length})</p>
                  {favorites.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#C7D8EE] bg-[#F5F9FE] p-8 text-center">
                      <p className="text-3xl">📍</p>
                      <p className="mt-2 font-medium">Todavía no has guardado ningún sitio</p>
                      <p className="text-sm text-[#5B6B82]">Explora abajo y pulsa ♡ para añadirlo aquí.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {favorites.map((v) => (
                        <VenueRow key={v.id} v={v} />
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Explorar sitios</p>
                    <input
                      className="w-56 rounded-xl border border-[#CFE0F3] bg-white px-3 py-1.5 text-sm outline-none transition focus:border-[#0E4DA4] focus:ring-2 focus:ring-[#0E4DA4]/15"
                      placeholder="Buscar por nombre, zona o tag…"
                      value={siteSearch}
                      onChange={(e) => setSiteSearch(e.target.value)}
                    />
                  </div>
                  {filteredVenues.length === 0 ? (
                    <p className="rounded-xl bg-[#EAF1FB] p-3 text-sm text-[#5B6B82]">Nada coincide con tu búsqueda.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {filteredVenues.map((v) => (
                        <VenueRow key={v.id} v={v} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {active === 'news' ? (
              <div className="animate-in space-y-4">
                <div>
                  <h1 className="text-2xl font-semibold">🔥 Noticias</h1>
                  <p className="mt-0.5 text-sm text-[#5B6B82]">Lo que se cuece en Madrid ahora mismo · vía esMadrid y Madrid Secreto</p>
                </div>

                {newsLoading ? (
                  <div className="rounded-2xl border border-dashed border-[#C7D8EE] bg-[#F5F9FE] p-10 text-center">
                    <p className="text-3xl animate-pulse">📡</p>
                    <p className="mt-2 text-sm text-[#5B6B82]">Buscando los planazos del momento…</p>
                  </div>
                ) : news.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#C7D8EE] bg-[#F5F9FE] p-10 text-center">
                    <p className="text-3xl">🛰️</p>
                    <p className="mt-2 font-medium">No hay novedades ahora mismo</p>
                    <p className="text-sm text-[#5B6B82]">
                      {newsError ? 'No pudimos conectar con la agenda de Madrid. Inténtalo más tarde.' : 'Vuelve en un rato, la agenda se actualiza sola.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {news.map((ev, i) => (
                      <a
                        key={ev.id}
                        href={ev.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-[#D8E3F2] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[#3B82D6] hover:shadow-md hover:shadow-[#3B82D6]/10"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0E4DA4] to-[#3B82D6] text-xs font-bold text-white">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{ev.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5B6B82]">
                            {ev.source ? <span className="rounded-full bg-[#E3ECF8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0E4DA4]">{ev.source}</span> : null}
                            <span>{ev.category}</span>
                            {ev.date ? <span>· {new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{ev.time ? ` · ${ev.time}` : ''}</span> : null}
                            {ev.venue ? <span className="truncate">· {ev.venue}</span> : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ev.free ? 'bg-[#E8F1E9] text-[#2E7D52]' : 'bg-[#E3ECF8] text-[#3A5378]'}`}>
                            {ev.free ? 'Gratis' : ev.price || '€'}
                          </span>
                          <span className="text-[10px] font-semibold text-[#0E4DA4]">⭐ {ev.score}</span>
                        </div>
                      </a>
                    ))}
                    <p className="pt-1 text-center text-[11px] text-[#8DA0BC]">Fuentes: esMadrid (open data oficial) y Madrid Secreto (RSS) · se actualiza periódicamente</p>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
