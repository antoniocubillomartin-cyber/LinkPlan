type Pace = 'relajado' | 'moderado' | 'intenso';

// Cada plan dura ~1-2h. Con los factores de ritmo (0.8–1.25) la base de 90 min
// se mantiene siempre dentro de ese rango (intenso ≈ 1h10, relajado ≈ 1h55).
const SLOT_BASE_MIN: Record<'morning' | 'lunch' | 'afternoon', number> = {
  morning: 90,
  lunch: 90,
  afternoon: 90
};
const PACE_FACTOR: Record<Pace, number> = { relajado: 1.25, moderado: 1, intenso: 0.8 };
const PACE_START: Record<Pace, number> = { relajado: 630, moderado: 600, intenso: 570 }; // minutos desde 00:00 (10:30 / 10:00 / 09:30)
const PACE_GAP: Record<Pace, number> = { relajado: 45, moderado: 30, intenso: 20 };

export type TimelineItem = {
  slot: 'morning' | 'lunch' | 'afternoon';
  label: string;
  venueName: string;
  start: string;
  end: string;
  durationMin: number;
};

const LABELS: Record<'morning' | 'lunch' | 'afternoon', string> = {
  morning: '🌅 Mañana',
  lunch: '🍽️ Comida',
  afternoon: '☀️ Tarde'
};

function fmt(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function buildTimeline(plan: {
  pace?: string;
  morning?: { name: string } | null;
  lunch: { name: string };
  afternoon?: { name: string } | null;
}): { items: TimelineItem[]; totalMin: number } {
  const pace: Pace = (['relajado', 'moderado', 'intenso'] as const).includes(plan.pace as Pace)
    ? (plan.pace as Pace)
    : 'moderado';
  const factor = PACE_FACTOR[pace];
  const gap = PACE_GAP[pace];

  const slots: Array<{ slot: 'morning' | 'lunch' | 'afternoon'; venueName: string }> = [
    ...(plan.morning ? [{ slot: 'morning' as const, venueName: plan.morning.name }] : []),
    { slot: 'lunch' as const, venueName: plan.lunch.name },
    ...(plan.afternoon ? [{ slot: 'afternoon' as const, venueName: plan.afternoon.name }] : [])
  ];

  let cursor = PACE_START[pace];
  let totalMin = 0;
  const items: TimelineItem[] = slots.map((s, i) => {
    if (i > 0) cursor += gap;
    const durationMin = roundTo5(SLOT_BASE_MIN[s.slot] * factor);
    const start = cursor;
    const end = cursor + durationMin;
    cursor = end;
    totalMin += durationMin;
    return {
      slot: s.slot,
      label: LABELS[s.slot],
      venueName: s.venueName,
      start: fmt(start),
      end: fmt(end),
      durationMin
    };
  });

  return { items, totalMin };
}

export function formatDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
