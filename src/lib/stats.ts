import type { RestaurantEntry } from '../data/seedData';
import { allVisits, round2 } from './utils';

type Rated = RestaurantEntry & { scores: NonNullable<RestaurantEntry['scores']> };
const rated = (list: RestaurantEntry[]) => list.filter((r): r is Rated => r.status === 'visited' && !!r.scores);

/** % de acuerdo: 100 − 10 × diferencia media entre las dos notas. */
export const syncPct = (list: RestaurantEntry[]) => {
  const r = rated(list);
  if (!r.length) return 100;
  const gap = r.reduce((a, x) => a + Math.abs(x.scores.gonzalo - x.scores.vero), 0) / r.length;
  return Math.max(0, Math.round(100 - gap * 10));
};

const groupAvg = (list: Rated[], key: (r: Rated) => string | undefined) => {
  const m = new Map<string, { n: number; sum: number }>();
  for (const r of list) {
    const k = key(r);
    if (!k) continue;
    const g = m.get(k) ?? { n: 0, sum: 0 };
    g.n++;
    g.sum += r.scores.average;
    m.set(k, g);
  }
  return [...m.entries()].map(([name, g]) => ({ name, count: g.n, avg: round2(g.sum / g.n) }));
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function summary(list: RestaurantEntry[]) {
  const r = rated(list);
  const n = r.length;
  const g = n ? round2(r.reduce((a, x) => a + x.scores.gonzalo, 0) / n) : 0;
  const v = n ? round2(r.reduce((a, x) => a + x.scores.vero, 0) / n) : 0;
  const avg = n ? round2(r.reduce((a, x) => a + x.scores.average, 0) / n) : 0;

  const priced = r.filter((x) => x.pricePerPerson != null);
  const spent = priced.reduce((a, x) => a + x.pricePerPerson! * 2, 0);
  const avgTicket = priced.length ? round2(priced.reduce((a, x) => a + x.pricePerPerson!, 0) / priced.length) : null;

  const byDiff = [...r].sort(
    (a, b) => Math.abs(b.scores.gonzalo - b.scores.vero) - Math.abs(a.scores.gonzalo - a.scores.vero)
  );
  const debate = byDiff[0] && Math.abs(byDiff[0].scores.gonzalo - byDiff[0].scores.vero) > 0 ? byDiff[0] : null;
  const unanimous = r.filter((x) => x.scores.gonzalo === x.scores.vero);

  const types = groupAvg(r, (x) => x.category).sort((a, b) => b.avg - a.avg || b.count - a.count);
  const hoods = groupAvg(r, (x) => x.neighborhood).sort((a, b) => b.count - a.count || b.avg - a.avg);
  const repeat = r.filter((x) => x.wouldRepeat).length;
  const repeatKnown = r.filter((x) => x.wouldRepeat != null).length;
  const best = r.length ? Math.max(...r.map((x) => x.scores.average)) : 0;

  // Últimos 6 meses
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: MONTHS[d.getMonth()], count: r.reduce((n, x) => n + allVisits(x).filter((v) => v.startsWith(key)).length, 0) };
  });

  return { n, g, v, avg, sync: syncPct(r), spent, pricedCount: priced.length, avgTicket, debate, unanimous, types, hoods, repeat, repeatKnown, best, months };
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  done: boolean;
}

/** Logros: pequeños hitos para picarse un poco (estilo apps de comida). */
export function achievements(list: RestaurantEntry[], home: boolean): Achievement[] {
  const r = rated(list);
  const n = r.length;
  const visits = r.flatMap(allVisits);
  const perMonth = new Map<string, number>();
  visits.forEach((v) => perMonth.set(v.slice(0, 7), (perMonth.get(v.slice(0, 7)) ?? 0) + 1));
  const hoods = new Set(r.map((x) => x.neighborhood).filter(Boolean));
  const types = new Set(r.map((x) => x.category));
  const photos = list.filter((x) => x.imageUrl?.startsWith('data:')).length;
  const word = home ? 'platos' : 'cuentas';
  return [
    { id: 'first', emoji: '🧾', title: home ? 'Primer plato' : 'Primera cuenta', hint: 'Votar la primera', done: n >= 1 },
    { id: 'five', emoji: '🖐️', title: `5 ${word}`, hint: `${Math.min(n, 5)}/5`, done: n >= 5 },
    { id: 'ten', emoji: '🔟', title: `10 ${word}`, hint: `${Math.min(n, 10)}/10`, done: n >= 10 },
    { id: 'twentyfive', emoji: '🏛️', title: `25 ${word}`, hint: `${Math.min(n, 25)}/25`, done: n >= 25 },
    { id: 'legend', emoji: '👑', title: 'Leyenda', hint: 'Una media de 9.5 o más', done: r.some((x) => x.scores.average >= 9.5) },
    { id: 'sync', emoji: '🤝', title: 'Misma nota', hint: 'Votar exactamente igual', done: r.some((x) => x.scores.gonzalo === x.scores.vero) },
    { id: 'debate', emoji: '🔥', title: 'Debate', hint: 'Diferir 1.5 puntos o más', done: r.some((x) => Math.abs(x.scores.gonzalo - x.scores.vero) >= 1.5) },
    { id: 'loyal', emoji: '🔁', title: home ? 'Receta fija' : 'Fieles', hint: home ? 'Repetir un plato' : 'Volver a un sitio', done: r.some((x) => (x.revisits?.length ?? 0) > 0) },
    { id: 'variety', emoji: '🌍', title: 'Variedad', hint: `${Math.min(types.size, 4)}/4 tipos distintos`, done: types.size >= 4 },
    ...(home
      ? [{ id: 'chef', emoji: '👩‍🍳', title: 'Recetario', hint: '3 recetas con paso a paso', done: list.filter((x) => x.recipe?.steps.length).length >= 3 }]
      : [{ id: 'hoods', emoji: '🗺️', title: 'Trotamundos', hint: `${Math.min(hoods.size, 3)}/3 barrios`, done: hoods.size >= 3 }]),
    { id: 'month', emoji: '📅', title: 'Mes intenso', hint: '4 en un mismo mes', done: [...perMonth.values()].some((c) => c >= 4) },
    { id: 'photos', emoji: '📸', title: 'Fotógrafos', hint: `${Math.min(photos, 3)}/3 fotos propias`, done: photos >= 3 },
  ];
}

const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Diario: cada visita (incluidas las repeticiones) agrupada por mes, de lo más reciente a lo más antiguo. */
export function diary(list: RestaurantEntry[]) {
  const events = rated(list)
    .flatMap((x) => allVisits(x).map((date, k) => ({ date, entry: x, again: k > 0 })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups: { label: string; items: typeof events }[] = [];
  for (const e of events) {
    const [y, m] = e.date.split('-').map(Number);
    const label = `${MONTH_LONG[m - 1]} ${y}`;
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}
