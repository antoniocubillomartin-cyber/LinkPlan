'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { TagSelector } from '@/components/TagSelector';
import { LoginScreen } from '@/components/LoginScreen';
import { useAuth } from '@/lib/authContext';
import type { Plan, Reservation, User, Venue } from '@/types';

const FOOD_TAGS = ['tradicional', 'italiano', 'vegetariano', 'vegano', 'rapido', 'asiatico', 'tapas', 'brunch', 'americano', 'vasco'];
const ACTIVITY_TAGS = ['arte', 'monumentos', 'naturaleza', 'adrenalina', 'fotografía', 'cultura', 'historia', 'grupos', 'relax', 'deporte', 'gastronomia'];
const PACE_TAGS = ['relajado', 'moderado', 'intenso'] as const;
const ZONES = ['', 'Centro', 'Retiro', 'Malasaña', 'Chamberí', 'La Latina'];

export default function Home() {
  const { user: authUser, loading: authLoading, logout } = useAuth();

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[#9A9390]">Cargando…</p>
      </main>
    );
  }

  if (!authUser) return <LoginScreen />;

  return <App authUser={authUser} onLogout={logout} />;
}

function App({ authUser, onLogout }: { authUser: User; onLogout: () => Promise<void> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [admin, setAdmin] = useState<{ restaurants: Venue[]; activities: Venue[]; stats: { plans: number; reservations: number } }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<'usuarios' | 'generar' | 'planes' | 'datos'>('usuarios');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [foodTags, setFoodTags] = useState<string[]>([]);
  const [activityTags, setActivityTags] = useState<string[]>([]);
  const [pace, setPace] = useState<(typeof PACE_TAGS)[number]>('moderado');

  const [organizerId, setOrganizerId] = useState('');
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState(50);
  const [zone, setZone] = useState('');

  const companions = useMemo(() => users.filter((u) => u.id !== organizerId), [users, organizerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, reservationsData, adminData] = await Promise.all([api.users(), api.reservations(), api.adminData()]);
      setUsers(usersData);
      setReservations(reservationsData);
      setAdmin(adminData);
      if (!organizerId) {
        const preferred = usersData.find((u) => u.id === authUser.id) ?? usersData[0];
        if (preferred) setOrganizerId(preferred.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [organizerId, authUser.id]);

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

  async function createPlan() {
    if (!organizerId) {
      setError('Selecciona un organizador');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextPlan = await api.generatePlan({ organizerId, companionIds, budgetPerPerson: budget, date, zone });
      setPlan(nextPlan);
      setActive('generar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el plan');
    } finally {
      setSaving(false);
    }
  }

  async function confirmPlan() {
    if (!plan) return;
    setSaving(true);
    try {
      await api.confirmReservation(plan.id);
      setPlan(null);
      setActive('planes');
      await refresh();
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
                      <p className="text-xs text-[#9A9390]">Ritmo: {user.pace}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {active === 'generar' ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-[#EAE4D9] p-4">
                  <h2 className="font-semibold">Generador de Planes Inteligentes</h2>
                  <label className="block text-sm">
                    Organizador
                    <select className="mt-1 w-full rounded-lg border p-2" value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                      <p>🌅 {plan.morning.name}</p>
                      <p>🍽️ {plan.lunch.name}</p>
                      <p>☀️ {plan.afternoon.name}</p>
                      <button className="w-full rounded-lg bg-[#C4673A] px-4 py-2 font-medium text-white" onClick={() => void confirmPlan()}>
                        Confirmar Reserva
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {active === 'planes' ? (
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold">Mis Planes y Reservas</h1>
                {reservations.map((r) => (
                  <article key={r.id} className="rounded-xl border border-[#EAE4D9] p-4 text-sm">
                    <p className="display text-lg font-semibold">{r.code}</p>
                    <p className="text-[#9A9390]">{new Date(r.plan.date).toLocaleDateString('es-ES')} · {r.plan.participants.map((p) => p.user.name).join(', ')}</p>
                    <p className="mt-1">🌅 {r.plan.morningVenue.name} · 🍽️ {r.plan.lunchVenue.name} · ☀️ {r.plan.afternoonVenue.name}</p>
                  </article>
                ))}
              </div>
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
            <p className="mb-1 mt-3 text-sm">Ritmo</p>
            <TagSelector tags={[...PACE_TAGS]} selected={[pace]} onToggle={(tag) => setPace(tag as typeof pace)} />
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
