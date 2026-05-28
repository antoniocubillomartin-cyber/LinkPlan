type Pace = 'relajado' | 'moderado' | 'intenso';

const SLOT_BASE_MIN: Record<'morning' | 'lunch' | 'afternoon', number> = {
  morning: 120,
  lunch: 90,
  afternoon: 120
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
  morning: { name: string };
  lunch: { name: string };
  afternoon: { name: string };
}): { items: TimelineItem[]; totalMin: number } {
  const pace: Pace = (['relajado', 'moderado', 'intenso'] as const).includes(plan.pace as Pace)
    ? (plan.pace as Pace)
    : 'moderado';
  const factor = PACE_FACTOR[pace];
  const gap = PACE_GAP[pace];

  const slots: Array<{ slot: 'morning' | 'lunch' | 'afternoon'; venueName: string }> = [
    { slot: 'morning', venueName: plan.morning.name },
    { slot: 'lunch', venueName: plan.lunch.name },
    { slot: 'afternoon', venueName: plan.afternoon.name }
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
