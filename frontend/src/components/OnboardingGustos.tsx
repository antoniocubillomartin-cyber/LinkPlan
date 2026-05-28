'use client';

import { useEffect, useRef, useState } from 'react';
import { TagSelector } from './TagSelector';
import { api } from '@/lib/api';
import type { TrendTag, User } from '@/types';

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
const PACE_OPTIONS = [
  { value: 'relajado', label: 'Relajado', hint: 'Tranqui, sin prisa' },
  { value: 'moderado', label: 'Moderado', hint: 'Equilibrado' },
  { value: 'intenso', label: 'Intenso', hint: 'A tope, día completo' }
] as const;

type Pace = (typeof PACE_OPTIONS)[number]['value'];

export function OnboardingGustos({
  me,
  onComplete
}: {
  me: User;
  onComplete: (patch: { foodTags: string[]; activityTags: string[]; pace: Pace }) => Promise<void>;
}) {
  const [foodTags, setFoodTags] = useState<string[]>(me.foodTags ?? []);
  const [activityTags, setActivityTags] = useState<string[]>(me.activityTags ?? []);
  const [pace, setPace] = useState<Pace>(me.pace ?? 'moderado');
  const [trending, setTrending] = useState<TrendTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preselected = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .trendingCategories(3)
      .then((data) => {
        if (cancelled) return;
        setTrending(data.top);
        if (!preselected.current && (me.foodTags?.length ?? 0) === 0 && (me.activityTags?.length ?? 0) === 0) {
          preselected.current = true;
          const food = data.top.filter((t) => t.kind === 'food').map((t) => t.tag);
          const activity = data.top.filter((t) => t.kind === 'activity').map((t) => t.tag);
          if (food.length) setFoodTags(food);
          if (activity.length) setActivityTags(activity);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me.foodTags, me.activityTags]);

  function toggle(value: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((t) => t !== value) : [...list, value]);
  }

  function toggleTrending(t: TrendTag) {
    if (t.kind === 'food') toggle(t.tag, foodTags, setFoodTags);
    else toggle(t.tag, activityTags, setActivityTags);
  }

  function isTrendingSelected(t: TrendTag) {
    return t.kind === 'food' ? foodTags.includes(t.tag) : activityTags.includes(t.tag);
  }

  const valid = foodTags.length > 0 || activityTags.length > 0;

  async function handleSubmit() {
    if (!valid) {
      setError('Elige al menos un gusto para que los planes te encajen.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onComplete({ foodTags, activityTags, pace });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar tus gustos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#EAE4D9] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[#B79B68]">Bienvenida, {me.name}</p>
          <h1 className="display mt-1 text-3xl font-semibold">Cuéntanos tus gustos</h1>
          <p className="mt-2 text-sm text-[#6B5D4F]">
            Usaremos esto para proponerte planes a tu medida. Puedes cambiarlos cuando quieras desde tu perfil.
          </p>
        </div>

        {trending.length > 0 ? (
          <section className="mb-6 rounded-xl border border-[#EAD9B7] bg-[#FBF4E6] p-4">
            <p className="text-sm font-medium">🔥 Tendencia en Madrid ahora</p>
            <p className="mt-1 text-xs text-[#6B5D4F]">Las preseleccionamos por ti. Quita o añade lo que quieras.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {trending.map((t) => {
                const active = isTrendingSelected(t);
                return (
                  <button
                    key={`${t.kind}-${t.tag}`}
                    type="button"
                    onClick={() => toggleTrending(t)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      active ? 'border-[#C4673A] bg-[#C4673A] text-white' : 'border-[#E0C99B] bg-white text-[#1A1714] hover:border-[#C4673A]'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {t.tag}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mb-6">
          <p className="mb-2 text-sm font-medium">Comida que te gusta</p>
          <TagSelector tags={FOOD_TAGS} selected={foodTags} onToggle={(t) => toggle(t, foodTags, setFoodTags)} />
        </section>

        <section className="mb-6">
          <p className="mb-2 text-sm font-medium">Planes y actividades</p>
          <TagSelector tags={ACTIVITY_TAGS} selected={activityTags} onToggle={(t) => toggle(t, activityTags, setActivityTags)} />
        </section>

        <section className="mb-6">
          <p className="mb-2 text-sm font-medium">Tu ritmo</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PACE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPace(opt.value)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  pace === opt.value ? 'border-[#1A1714] bg-[#1A1714] text-white' : 'border-[#EAE4D9] hover:bg-[#FAF7F2]'
                }`}
              >
                <p className="font-medium">{opt.label}</p>
                <p className={`text-xs ${pace === opt.value ? 'text-[#EAE4D9]' : 'text-[#9A9390]'}`}>{opt.hint}</p>
              </button>
            ))}
          </div>
        </section>

        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => void handleSubmit()}
          className="w-full rounded-xl bg-[#1A1714] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Empezar a planear'}
        </button>
      </div>
    </main>
  );
}
