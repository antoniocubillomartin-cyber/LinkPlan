'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { TagSelector } from '@/components/TagSelector';
import { LoginScreen } from '@/components/LoginScreen';
import { ProfilePanel } from '@/components/ProfilePanel';
import { OnboardingGustos } from '@/components/OnboardingGustos';
import { useAuth } from '@/lib/authContext';
import { buildTimeline, formatDuration } from '@/lib/timeline';
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
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white p-2 shadow-lg animate-pulse">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Gatos y Cañas" className="h-full w-full object-contain" />
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#B79B68]">GATOS Y CAÑAS</p>
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
  const [validatingUrls, setValidatingUrls] = useState(false);
  const [urlSummary, setUrlSummary] = useState<{ total: number; valid: number; broken: number } | null>(null);
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

  const companions = useMemo(() => friends, [friends]);

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
        morningVenueId: plan.morning.id,
        lunchVenueId: plan.lunch.id,
        afternoonVenueId: plan.afternoon.id
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

  async function runUrlValidation() {
    setValidatingUrls(true);
    setError(null);
    try {
      const summary = await api.validateUrls();
      setUrlSummary({ total: summary.total, valid: summary.valid, broken: summary.broken });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron verificar los enlaces');
    } finally {
      setValidatingUrls(false);
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#EAE4D9] bg-white/95 shadow-xl shadow-[#1A1714]/5 backdrop-blur">
        <header className="relative flex flex-col items-center gap-1 border-b border-[#EAE4D9] bg-gradient-to-b from-[#FBF3E6] to-white px-6 py-6 text-center">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Gatos y Cañas" className="h-14 w-auto object-contain drop-shadow-sm" />
            <span className="display text-3xl font-semibold">Gatos y Cañas</span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#B79B68]">Planificador de ocio compartido</p>
          <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#C4673A] via-[#E0A258] to-[#6B8F71]" />
        </header>
        <div className="grid min-h-[80vh] grid-cols-1 lg:grid-cols-[264px_1fr]">
          <aside className="flex flex-col border-b border-[#EAE4D9] bg-[#FCFAF5] p-5 lg:border-b-0 lg:border-r">
            <div className="grid gap-1.5">
              {([
                ['perfil', 'Mi Usuario', '🐱'],
                ['usuarios', 'Gestión de Usuarios', '👥'],
                ['generar', 'Generar Plan', '✨'],
                ['planes', 'Mis Planes y Reservas', '🗓️'],
                ['datos', 'Panel de Datos', '📊']
              ] as const).map(([key, label, icon]) => (
                <button
                  key={key}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    active === key
                      ? 'bg-[#1A1714] text-[#FAF7F2] shadow-sm shadow-[#1A1714]/20'
                      : 'text-[#6B5D4F] hover:bg-[#F1E7D6]'
                  }`}
                  onClick={() => setActive(key as typeof active)}
                >
                  <span className="text-base">{icon}</span>
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
              <div className="animate-in">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold">Perfiles y Gustos</h1>
                    <p className="mt-0.5 text-sm text-[#9A8F80]">{users.length} {users.length === 1 ? 'persona' : 'personas'} en la comunidad</p>
                  </div>
                  <button
                    className="rounded-xl bg-[#1A1714] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-black"
                    onClick={() => setShowModal(true)}
                  >
                    + Nuevo Usuario
                  </button>
                </div>
                {users.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E0D6C2] bg-[#FCFAF5] p-10 text-center">
                    <p className="text-3xl">🐱🍺</p>
                    <p className="mt-2 font-medium">Aún no hay nadie por aquí</p>
                    <p className="text-sm text-[#9A8F80]">Crea el primer perfil para empezar a planear.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {users.map((user) => (
                      <article
                        key={user.id}
                        className="group rounded-2xl border border-[#EAE4D9] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#E0A258] hover:shadow-md hover:shadow-[#E0A258]/10"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                              style={{ backgroundColor: user.color }}
                            >
                              {user.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{user.name}</p>
                              {user.username ? <p className="truncate text-xs text-[#9A8F80]">@{user.username}</p> : null}
                            </div>
                          </div>
                          <button
                            className="rounded-lg px-2 py-1 text-xs text-[#C0857A] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                            onClick={() => void removeUser(user.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[...user.foodTags, ...user.activityTags].slice(0, 6).map((t) => (
                            <span key={t} className="rounded-full bg-[#F3EADB] px-2 py-0.5 text-[10px] font-medium text-[#8A7A5E]">{t}</span>
                          ))}
                          {[...user.foodTags, ...user.activityTags].length === 0 ? (
                            <span className="text-[10px] text-[#B7AE9E]">Sin gustos todavía</span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {active === 'generar' ? (
              <div className="grid animate-in gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-[#EAE4D9] bg-white p-5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <h2 className="display text-lg font-semibold">Generador de planes</h2>
                  </div>
                  <div className="rounded-xl border border-[#F0E3CC] bg-[#FBF3E6] p-3 text-xs text-[#8A7A5E]">
                    Organizado por <strong>{authUser.name}</strong> (tú) · elige acompañantes abajo
                  </div>
                  <label className="block text-sm">
                    Fecha
                    <input type="date" className="mt-1 w-full rounded-xl border border-[#E5DBC8] bg-white p-2.5 outline-none transition focus:border-[#C4673A] focus:ring-2 focus:ring-[#C4673A]/15" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    Presupuesto por persona (€)
                    <input type="number" min={10} max={500} className="mt-1 w-full rounded-xl border border-[#E5DBC8] bg-white p-2.5 outline-none transition focus:border-[#C4673A] focus:ring-2 focus:ring-[#C4673A]/15" value={budget} onChange={(e) => setBudget(Number(e.target.value || 50))} />
                  </label>
                  <label className="block text-sm">
                    Zona
                    <select className="mt-1 w-full rounded-xl border border-[#E5DBC8] bg-white p-2.5 outline-none transition focus:border-[#C4673A] focus:ring-2 focus:ring-[#C4673A]/15" value={zone} onChange={(e) => setZone(e.target.value)}>
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z || 'Sin preferencia'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Duración
                    <select className="mt-1 w-full rounded-xl border border-[#E5DBC8] bg-white p-2.5 outline-none transition focus:border-[#C4673A] focus:ring-2 focus:ring-[#C4673A]/15" value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
                      {DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="mb-1 text-sm">Acompañantes</p>
                    {companions.length === 0 ? (
                      <p className="rounded-lg bg-[#FAF7F2] p-3 text-xs text-[#9A9390]">
                        Solo puedes invitar a tus amigos. Añade amigos en <strong>Mi Usuario</strong> para incluirlos aquí.
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
                                picked ? 'border-[#1A1714] bg-[#1A1714] text-white' : 'border-[#E5DBC8] hover:border-[#C4673A] hover:text-[#C4673A]'
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
                    className="w-full rounded-xl bg-gradient-to-r from-[#C4673A] to-[#E0A258] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                    onClick={() => void createPlan()}
                  >
                    {saving ? 'Generando…' : '✨ Generar Plan'}
                  </button>
                </div>
                <div className="rounded-2xl border border-[#EAE4D9] bg-white p-5">
                  {!plan ? (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-[#E0D6C2] bg-[#FCFAF5] p-8 text-center">
                      <p className="text-3xl">🗺️</p>
                      <p className="mt-2 font-medium">Tu itinerario aparecerá aquí</p>
                      <p className="text-sm text-[#9A8F80]">Configura el plan a la izquierda y pulsa Generar.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="display text-xl">Plan para {plan.allUsers.map((u) => u.name).join(' & ')}</h3>
                        <span className="rounded-full bg-[#FBF4E6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9A5A2E]">Borrador</span>
                      </div>

                      <div className="rounded-lg bg-[#FAF7F2] p-3 text-xs">
                        <p>
                          <strong>{plan.totalCost.toFixed(0)}€</strong> / {plan.totalPeople} {plan.totalPeople === 1 ? 'persona' : 'personas'} ={' '}
                          <strong>{(plan.totalCost / plan.totalPeople).toFixed(0)}€</strong> por cabeza
                        </p>
                        <p className="text-[#9A9390]">Presupuesto: {plan.totalBudget.toFixed(0)}€ · Sobran {plan.remainingBudget.toFixed(0)}€</p>
                      </div>

                      {(() => {
                        const { items, totalMin } = buildTimeline(plan);
                        const venueBySlot = { morning: plan.morning, lunch: plan.lunch, afternoon: plan.afternoon };
                        return (
                          <div className="space-y-1">
                            {items.map((it) => (
                              <div key={it.slot} className="flex items-baseline gap-2">
                                <span className="w-24 shrink-0 font-mono text-xs text-[#9A9390]">{it.start}–{it.end}</span>
                                <a className="hover:underline" href={venueBySlot[it.slot].url} target="_blank" rel="noreferrer">
                                  {it.label.split(' ')[0]} {venueBySlot[it.slot].name}
                                </a>
                              </div>
                            ))}
                            <p className="pt-1 text-xs text-[#9A9390]">Duración total: {formatDuration(totalMin)}</p>
                          </div>
                        );
                      })()}

                      <div className="flex gap-2">
                        <button disabled={saving} className="flex-1 rounded-lg bg-[#C4673A] px-4 py-2 font-medium text-white disabled:opacity-50" onClick={() => void savePlan()}>
                          {saving ? 'Guardando…' : 'Confirmar plan'}
                        </button>
                        <button disabled={saving} className="rounded-lg border border-[#EAE4D9] px-4 py-2 text-sm hover:bg-[#FAF7F2] disabled:opacity-50" onClick={() => void regeneratePlan()}>
                          Otra opción
                        </button>
                      </div>
                      <p className="text-center text-[11px] text-[#9A9390]">No se guarda hasta que confirmes.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {active === 'planes' ? (
              <div className="animate-in space-y-3">
                <div>
                  <h1 className="text-2xl font-semibold">Mis Planes y Reservas</h1>
                  <p className="mt-0.5 text-sm text-[#9A8F80]">{myPlans.length} {myPlans.length === 1 ? 'plan' : 'planes'} guardado{myPlans.length === 1 ? '' : 's'}</p>
                </div>
                {myPlans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E0D6C2] bg-[#FCFAF5] p-10 text-center">
                    <p className="text-3xl">🗓️</p>
                    <p className="mt-2 font-medium">Aún no tienes planes guardados</p>
                    <p className="text-sm text-[#9A8F80]">Crea uno en <strong>Generar Plan</strong> y confírmalo para verlo aquí.</p>
                    <button
                      className="mt-4 rounded-xl bg-[#1A1714] px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
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
                    <article key={p.id} className={`rounded-2xl border bg-white p-4 text-sm transition ${isExpanded ? 'border-[#C4673A] shadow-md shadow-[#C4673A]/10' : 'border-[#EAE4D9] hover:border-[#E0A258]'} ${p.status === 'COMPLETED' ? 'opacity-70' : ''}`}>
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
                              <div className="rounded-lg border border-[#EAE4D9] p-3">
                                <p className="mb-2 text-xs font-medium text-[#6B5D4F]">Horario sugerido · {formatDuration(totalMin)}</p>
                                <div className="space-y-1 text-xs">
                                  {items.map((it) => (
                                    <div key={it.slot} className="flex items-baseline gap-2">
                                      <span className="w-24 shrink-0 font-mono text-[#9A9390]">{it.start}–{it.end}</span>
                                      <span>{it.label} · {it.venueName}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

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
                              {p.status === 'ACTIVE' && !p.reservation ? (
                                <button className="rounded-lg bg-[#C4673A] px-3 py-2 text-xs font-medium text-white" onClick={() => void reservePlan(p.id)}>
                                  Reservar
                                </button>
                              ) : null}
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
              (() => {
                const allVenues = [...(admin?.restaurants ?? []), ...(admin?.activities ?? [])];
                const checked = allVenues.filter((v) => v.lastVerified);
                const broken = allVenues.filter((v) => v.urlValid === false);
                const okLinks = allVenues.filter((v) => v.urlValid === true).length;

                const stats: { label: string; value: number; icon: string; from: string; to: string }[] = [
                  { label: 'Planes', value: admin?.stats.plans ?? 0, icon: '🗓️', from: '#C4673A', to: '#E0A258' },
                  { label: 'Reservas', value: admin?.stats.reservations ?? 0, icon: '✅', from: '#6B8F71', to: '#8FB596' },
                  { label: 'Restaurantes', value: admin?.restaurants.length ?? 0, icon: '🍽️', from: '#1A1714', to: '#4A413A' },
                  { label: 'Actividades', value: admin?.activities.length ?? 0, icon: '🎟️', from: '#B79B68', to: '#D9C29A' }
                ];

                const urlBadge = (v: Venue) =>
                  v.urlValid === true ? (
                    <span className="rounded-full bg-[#E8F1E9] px-2 py-0.5 text-[10px] font-medium text-[#3F6B4A]">✓ ok</span>
                  ) : v.urlValid === false ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">⚠ {v.lastStatusCode ?? 'caído'}</span>
                  ) : (
                    <span className="rounded-full bg-[#F1ECE3] px-2 py-0.5 text-[10px] font-medium text-[#A89C88]">sin verificar</span>
                  );

                const VenueList = ({ title, items }: { title: string; items: Venue[] }) => (
                  <div className="rounded-2xl border border-[#EAE4D9] bg-white p-4">
                    <p className="mb-3 flex items-center justify-between text-sm font-semibold">
                      {title}
                      <span className="text-xs font-normal text-[#9A8F80]">{items.length}</span>
                    </p>
                    <div className="thin-scroll max-h-80 space-y-1.5 overflow-auto pr-1">
                      {items.map((v) => (
                        <a
                          key={v.id}
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-[#EAE4D9] hover:bg-[#FCFAF5]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{v.name}</span>
                            <span className="block truncate text-[11px] text-[#9A8F80]">{v.zone} · {v.price === 0 ? 'Gratis' : `${v.price}€`}</span>
                          </span>
                          {urlBadge(v)}
                        </a>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <div className="animate-in space-y-5">
                    <h1 className="text-2xl font-semibold">Panel de Datos</h1>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {stats.map((s) => (
                        <div
                          key={s.label}
                          className="rounded-2xl p-4 text-white shadow-sm"
                          style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}
                        >
                          <p className="text-2xl">{s.icon}</p>
                          <p className="mt-1 display text-3xl font-semibold leading-none">{s.value}</p>
                          <p className="mt-1 text-xs uppercase tracking-wider opacity-80">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-[#EAE4D9] bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">Estado de los enlaces</p>
                          <p className="text-xs text-[#9A8F80]">
                            {checked.length === 0
                              ? 'Todavía no se han verificado los enlaces de los locales.'
                              : `${okLinks} ok · ${broken.length} caído${broken.length === 1 ? '' : 's'} · ${checked.length}/${allVenues.length} verificados`}
                          </p>
                          {urlSummary ? (
                            <p className="mt-1 text-xs text-[#6B8F71]">Última verificación: {urlSummary.valid}/{urlSummary.total} ok.</p>
                          ) : null}
                        </div>
                        <button
                          disabled={validatingUrls}
                          onClick={() => void runUrlValidation()}
                          className="rounded-xl bg-[#1A1714] px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
                        >
                          {validatingUrls ? 'Verificando…' : '🔗 Verificar enlaces'}
                        </button>
                      </div>
                      {broken.length > 0 ? (
                        <ul className="mt-3 space-y-1 border-t border-[#F1ECE3] pt-3 text-xs text-red-600">
                          {broken.map((v) => (
                            <li key={v.id}>
                              ⚠️ {v.name} — {v.lastStatusCode ?? 'sin respuesta'} ·{' '}
                              <a className="underline" href={v.url} target="_blank" rel="noreferrer">{v.url}</a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <VenueList title="Restaurantes" items={admin?.restaurants ?? []} />
                      <VenueList title="Actividades" items={admin?.activities ?? []} />
                    </div>
                  </div>
                );
              })()
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
