'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { TagSelector } from '@/components/TagSelector';
import { LoginScreen } from '@/components/LoginScreen';
import { ProfilePanel } from '@/components/ProfilePanel';
import { OnboardingGustos } from '@/components/OnboardingGustos';
import { useAuth } from '@/lib/authContext';
import type { Plan, PlanSuggestion, PlanSuggestions, StoredPlan, User, Venue } from '@/types';

const FOOD_TAGS = [
  'tradicional', 'tapas', 'español', 'italiano', 'pizza', 'pasta', 'asiatico', 'japones', 'sushi',
  'mexicano', 'americano', 'hamburgesas', 'vegetariano', 'vegano', 'saludable', 'mediterraneo',
  'pescado', 'brunch', 'cafe', 'postres', 'rapido', 'vasco', 'pintxos', 'birras', 'copas'
];
const ACTIVITY_TAGS = [
  'arte', 'cultura', 'historia', 'monumentos', 'exposiciones', 'contemporaneo',
  'naturaleza', 'paseo', 'relax', 'fotografía', 'vistas', 'gastronomia',
  'fiestas', 'copas', 'birras', 'terraza', 'planes-noche', 'musica', 'conciertos',
  'mercadillos', 'adrenalina', 'deporte', 'grupos', 'diversión'
];
const PACE_TAGS = ['relajado', 'moderado', 'intenso'] as const;
const DURATIONS = [
  { value: 'corto', label: 'Corto (2-3h)' },
  { value: 'medio', label: 'Medio (medio día)' },
  { value: 'largo', label: 'Largo (día entero)' }
] as const;
const ZONES = ['', 'Centro', 'Retiro', 'Malasaña', 'Chamberí', 'La Latina'];

export default function Home() {
  const { user: authUser, loading: authLoading, logout, setUser } = useAuth();

  if (authLoading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1A1714] text-3xl text-[#FAF7F2] shadow-lg animate-pulse">
          🤝
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#B79B68]">LINK &amp; PLAN</p>
          <p className="mt-1 display text-lg text-[#1A1714]">Preparando tu sesión…</p>
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-[#EAE4D9]">
          <div className="h-full w-1/2 animate-loader bg-[#1A1714]" />
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
  const [admin, setAdmin] = useState<{ restaurants: Venue[]; activities: Venue[]; stats: { plans: number; reservations: number } }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<'usuarios' | 'generar' | 'planes' | 'perfil' | 'datos'>('usuarios');
  const [friends, setFriends] = useState<User[]>([]);
  const [me, setMe] = useState<User>(authUser);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [duration, setDuration] = useState<'corto' | 'medio' | 'largo'>('medio');
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [foodTags, setFoodTags] = useState<string[]>([]);
  const [activityTags, setActivityTags] = useState<string[]>([]);
  const [pace, setPace] = useState<(typeof PACE_TAGS)[number]>('moderado');

  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState(50);
  const [zone, setZone] = useState('');

  const companions = useMemo(() => users.filter((u) => u.id !== authUser.id), [users, authUser.id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, adminData, mine, friendsData, sugg] = await Promise.all([
        api.users(),
        api.adminData(),
        api.myPlans().catch(() => []),
        api.friends().catch(() => []),
        api.planSuggestions().catch(() => [] as PlanSuggestions[])
      ]);
      setUsers(usersData);
      setAdmin(adminData);
      setMyPlans(mine);
      setFriends(friendsData);
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

  function toggleTag(value: string, selected: string[], setter: (next: string[]) => void) {
    setter(selected.includes(value) ? selected.filter((t) => t !== value) : [...selected, value]);
  }

  async function addUser() {
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createUser({ name: name.trim(), foodTags, activityTags, pace });
      setName('');
      setFoodTags([]);
      setActivityTags([]);
      setPace('moderado');
      setShowModal(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario');
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    await api.deleteUser(id);
    await refresh();
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el plan');
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePlan() {
    if (!plan) return;
    await createPlan({ excludeIds: [plan.morning.id, plan.lunch.id, plan.afternoon.id] });
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

  async function confirmPlan() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      await api.confirmReservation(plan.id);
      const planId = plan.id;
      await refresh();
      setPlan(null);
      setExpandedPlanId(planId);
      setActive('planes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la reserva');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto max-w-7xl rounded-2xl border border-[#EAE4D9] bg-white shadow-sm">
        <div className="grid min-h-[80vh] grid-cols-1 lg:grid-cols-[260px_1fr]">
          <aside className="flex flex-col border-b border-[#EAE4D9] p-5 lg:border-b-0 lg:border-r">
            <p className="display text-xl font-semibold">🤝 Link & Plan</p>
            <p className="mt-1 text-xs text-[#9A9390]">Planificador de Ocio Compartido</p>
            <div className="mt-5 grid gap-2">
              {[
                ['perfil', 'Mi Usuario'],
                ['usuarios', 'Gestión de Usuarios'],
                ['generar', 'Generar Plan'],
                ['planes', 'Mis Planes y Reservas'],
                ['datos', 'Panel de Datos']
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-medium ${active === key ? 'bg-[#1A1714] text-[#FAF7F2]' : 'hover:bg-[#E8DCC8]'}`}
                  onClick={() => setActive(key as typeof active)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-auto pt-6 border-t border-[#EAE4D9] mt-6">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: authUser.color }}
                >
                  {authUser.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{authUser.name}</p>
                  <p className="truncate text-xs text-[#9A9390]">@{authUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => void onLogout()}
                className="mt-3 w-full rounded-lg border border-[#EAE4D9] px-3 py-2 text-xs text-[#6B5D4F] hover:bg-[#FAF7F2]"
              >
                Cerrar sesión
              </button>
            </div>
          </aside>

          <section className="p-6">
            {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            {loading ? <p className="text-sm text-[#9A9390]">Cargando datos...</p> : null}

            {active === 'usuarios' ? (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h1 className="text-2xl font-semibold">Perfiles y Gustos</h1>
                  <button className="rounded-lg bg-[#1A1714] px-4 py-2 text-sm font-medium text-white" onClick={() => setShowModal(true)}>
                    Nuevo Usuario
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {users.map((user) => (
                    <article key={user.id} className="rounded-xl border border-[#EAE4D9] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold">{user.name}</p>
                        <button className="text-xs text-red-500" onClick={() => void removeUser(user.id)}>
                          Eliminar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...user.foodTags, ...user.activityTags].slice(0, 5).map((t) => (
                          <span key={t} className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] text-[#6B5D4F]">{t}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {active === 'generar' ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-[#EAE4D9] p-4">
                  <h2 className="font-semibold">Generador de Planes Inteligentes</h2>
                  <div className="rounded-lg bg-[#FAF7F2] p-3 text-xs text-[#6B5D4F]">
                    Organizado por <strong>{authUser.name}</strong> (tú) · selecciona acompañantes abajo
                  </div>
                  <label className="block text-sm">
                    Fecha
                    <input type="date" className="mt-1 w-full rounded-lg border p-2" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    Presupuesto por persona (€)
                    <input type="number" min={10} max={500} className="mt-1 w-full rounded-lg border p-2" value={budget} onChange={(e) => setBudget(Number(e.target.value || 50))} />
                  </label>
                  <label className="block text-sm">
                    Zona
                    <select className="mt-1 w-full rounded-lg border p-2" value={zone} onChange={(e) => setZone(e.target.value)}>
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z || 'Sin preferencia'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Duración
                    <select className="mt-1 w-full rounded-lg border p-2" value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
                      {DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="mb-1 text-sm">Acompañantes</p>
                    <div className="flex flex-wrap gap-2">
                      {companions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleTag(u.id, companionIds, setCompanionIds)}
                          className={`rounded-full border px-3 py-1 text-sm ${companionIds.includes(u.id) ? 'bg-[#1A1714] text-white' : ''}`}
                        >
                          {u.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button disabled={saving} className="w-full rounded-lg bg-[#1A1714] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => void createPlan()}>
                    {saving ? 'Generando...' : 'Generar Plan'}
                  </button>
                </div>
                <div className="rounded-xl border border-[#EAE4D9] p-4">
                  {!plan ? (
                    <p className="text-sm text-[#9A9390]">Tu itinerario aparecerá aquí.</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <h3 className="display text-xl">Plan para {plan.allUsers.map((u) => u.name).join(' & ')}</h3>
                      <p>Coste: {plan.totalCost.toFixed(0)}€ / Presupuesto: {plan.totalBudget.toFixed(0)}€</p>
                      <a className="block hover:underline" href={plan.morning.url} target="_blank" rel="noreferrer">🌅 {plan.morning.name}</a>
                      <a className="block hover:underline" href={plan.lunch.url} target="_blank" rel="noreferrer">🍽️ {plan.lunch.name}</a>
                      <a className="block hover:underline" href={plan.afternoon.url} target="_blank" rel="noreferrer">☀️ {plan.afternoon.name}</a>
                      <div className="flex gap-2">
                        <button className="flex-1 rounded-lg bg-[#C4673A] px-4 py-2 font-medium text-white" onClick={() => void confirmPlan()}>
                          Confirmar Reserva
                        </button>
                        <button disabled={saving} className="rounded-lg border border-[#EAE4D9] px-4 py-2 text-sm hover:bg-[#FAF7F2] disabled:opacity-50" onClick={() => void regeneratePlan()}>
                          Otra opción
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {active === 'planes' ? (
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold">Mis Planes y Reservas</h1>
                {myPlans.length === 0 ? (
                  <p className="text-sm text-[#9A9390]">Aún no tienes planes. Crea uno en la sección Generar Plan.</p>
                ) : null}
                {myPlans.map((p) => {
                  const isExpanded = expandedPlanId === p.id;
                  const isOrganizer = p.organizerId === authUser.id;
                  const planSuggestions = suggestions[p.id] ?? [];
                  const statusLabel = p.status === 'COMPLETED' ? '✅ Completado' : p.status === 'CANCELLED' ? '✖ Cancelado' : '🟢 Activo';
                  return (
                    <article key={p.id} className={`rounded-xl border p-4 text-sm transition ${isExpanded ? 'border-[#1A1714]' : 'border-[#EAE4D9]'} ${p.status === 'COMPLETED' ? 'opacity-70' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="display text-lg font-semibold">{new Date(p.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                            {p.reservation ? (
                              <span className="rounded-full bg-[#6B8F71] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                                Reservado · {p.reservation.code}
                              </span>
                            ) : null}
                            {planSuggestions.length > 0 ? (
                              <span className="rounded-full bg-[#C4673A] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                                🔥 {planSuggestions.length} mejora{planSuggestions.length > 1 ? 's' : ''}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-[#9A9390]">{statusLabel} · {p.participants.map((pp) => pp.user.name).join(', ')}</p>
                          <p className="mt-1 truncate text-xs text-[#6B5D4F]">🌅 {p.morningVenue.name} · 🍽️ {p.lunchVenue.name} · ☀️ {p.afternoonVenue.name}</p>
                        </div>
                        <span className="text-xs text-[#9A9390]">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded ? (
                        <div className="mt-4 space-y-4 border-t border-[#EAE4D9] pt-4">
                          <div className="grid gap-3 sm:grid-cols-3">
                            {([['🌅', 'Mañana', p.morningVenue], ['🍽️', 'Comida', p.lunchVenue], ['☀️', 'Tarde', p.afternoonVenue]] as const).map(([emoji, label, venue]) => (
                              <div key={label} className="rounded-lg bg-[#FAF7F2] p-3">
                                <p className="text-xs uppercase tracking-wider text-[#9A9390]">{emoji} {label}</p>
                                <a className="mt-1 block font-medium hover:underline" href={venue.url} target="_blank" rel="noreferrer">{venue.name} ↗</a>
                                <p className="mt-1 text-xs text-[#9A9390]">{venue.zone} · {venue.price === 0 ? 'Gratis' : `${venue.price}€`}</p>
                                <p className="text-xs text-[#9A9390]">{venue.schedule}</p>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B5D4F]">
                            <span>Coste total: <strong>{p.totalCost.toFixed(0)}€</strong> de {p.totalBudget.toFixed(0)}€</span>
                            <span>Duración: <strong>{p.duration}</strong></span>
                            <span>Zona: <strong>{p.zone || 'libre'}</strong></span>
                            {p.reservation ? <span>Reserva: <strong>{p.reservation.code}</strong></span> : null}
                          </div>

                          {planSuggestions.length > 0 ? (
                            <div className="rounded-lg border border-[#EAD9B7] bg-[#FBF4E6] p-3">
                              <p className="text-xs font-semibold text-[#9A5A2E]">🔥 Mejores opciones para tus gustos</p>
                              <p className="mt-0.5 text-[11px] text-[#6B5D4F]">Sugerencias según los gustos de los participantes. Tú decides si las aplicas.</p>
                              <div className="mt-2 space-y-2">
                                {planSuggestions.map((s) => {
                                  const slotLabel = s.slot === 'morning' ? '🌅 Mañana' : s.slot === 'lunch' ? '🍽️ Comida' : '☀️ Tarde';
                                  return (
                                    <div key={s.slot} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2">
                                      <div className="min-w-0 text-xs">
                                        <p className="text-[10px] uppercase tracking-wider text-[#9A9390]">{slotLabel}</p>
                                        <p className="truncate">
                                          <span className="line-through text-[#9A9390]">{s.currentVenueName}</span>
                                          {' → '}
                                          <strong>{s.alternativeVenueName}</strong>
                                        </p>
                                        <p className="text-[10px] text-[#6B8F71]">
                                          {s.scoreImprovement} de afinidad
                                          {s.priceDelta !== 0 ? ` · ${s.priceDelta > 0 ? '+' : ''}${s.priceDelta}€/persona` : ' · mismo precio'}
                                        </p>
                                      </div>
                                      <button
                                        className="rounded-lg bg-[#C4673A] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
                                className="mt-1 w-full rounded-lg border p-2 disabled:opacity-50"
                                onBlur={(e) => {
                                  if (e.target.value && e.target.value !== p.date.slice(0, 10)) void changePlanDate(p.id, e.target.value);
                                }}
                              />
                            </label>
                            <div className="flex flex-col justify-end gap-2">
                              {p.status === 'ACTIVE' ? (
                                <button className="rounded-lg bg-[#6B8F71] px-3 py-2 text-xs font-medium text-white" onClick={() => void completePlan(p.id)}>
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

            {active === 'perfil' ? (
              <ProfilePanel
                me={me}
                friends={friends}
                allUsers={users}
                onSave={(patch) => void saveProfile(patch)}
                onToggleFriend={(uid) => void toggleFriend(uid)}
              />
            ) : null}

            {active === 'datos' ? (
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold">Panel de Datos</h1>
                <p className="text-sm text-[#9A9390]">Planes: {admin?.stats.plans ?? 0} · Reservas: {admin?.stats.reservations ?? 0}</p>
                <details className="rounded-xl border border-[#EAE4D9] p-3">
                  <summary className="cursor-pointer font-medium">Restaurantes ({admin?.restaurants.length ?? 0})</summary>
                  <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(admin?.restaurants ?? [], null, 2)}</pre>
                </details>
                <details className="rounded-xl border border-[#EAE4D9] p-3">
                  <summary className="cursor-pointer font-medium">Actividades ({admin?.activities.length ?? 0})</summary>
                  <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(admin?.activities ?? [], null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Nuevo usuario</h2>
            <input className="mb-3 w-full rounded-lg border p-2" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mb-1 text-sm">Comida</p>
            <TagSelector tags={FOOD_TAGS} selected={foodTags} onToggle={(tag) => toggleTag(tag, foodTags, setFoodTags)} />
            <p className="mb-1 mt-3 text-sm">Actividades</p>
            <TagSelector tags={ACTIVITY_TAGS} selected={activityTags} onToggle={(tag) => toggleTag(tag, activityTags, setActivityTags)} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border px-4 py-2" onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button disabled={saving} className="rounded-lg bg-[#1A1714] px-4 py-2 text-white disabled:opacity-50" onClick={() => void addUser()}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
