import type { Kind, RestaurantEntry } from '../data/seedData';

/** Para comparar y buscar sin tildes ni mayúsculas. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const round2 =(n: number) => Math.round(n * 100) / 100;
/** 9.65 → "9.65", 8.9 → "8.9", 9 → "9.0" */
export const fmtScore = (n: number) => {
  const r = round2(n);
  return Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2);
};
export const fmtEuro = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} €`;
export const avgOf = (g: number, v: number) => round2((g + v) / 2);

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `x-${crypto.randomUUID().slice(0, 8)}`
    : `x-${Date.now().toString(36)}`;

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export const stampDate = (iso?: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return null;
  return { day: d, month: MONTHS[Number(m) - 1] ?? m, year: y, short: `${d}.${m}.${y.slice(2)}` };
};

export const daysSince = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((start - then) / 86400000));
};

export const ofKind = (list: RestaurantEntry[], kind: Kind) => list.filter((r) => r.kind === kind);

/** Ranking: visitados por media; desempate por la visita más reciente. */
export const rankVisited = (list: RestaurantEntry[]) =>
  list
    .filter((r) => r.status === 'visited' && r.scores)
    .sort(
      (a, b) => b.scores!.average - a.scores!.average || (b.visitDate ?? '').localeCompare(a.visitDate ?? '')
    );

export const verdict = (avg: number) => {
  if (avg >= 9.5) return 'Leyenda absoluta';
  if (avg >= 9) return 'Matrícula de honor';
  if (avg >= 8) return 'Sobresaliente';
  if (avg >= 7) return 'Notable';
  if (avg >= 6) return 'Bien';
  if (avg >= 5) return 'Aprobado raspado';
  return 'Suspenso';
};

export const directionsUrl = ([lat, lng]: [number, number]) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const EMOJI: [RegExp, string][] = [
  [/sushi|japon/i, '🍣'],
  [/ramen/i, '🍜'],
  [/burger|hamburgues/i, '🍔'],
  [/pizza/i, '🍕'],
  [/italian|pasta/i, '🍝'],
  [/burrito|mexic|taco/i, '🌯'],
  [/postre|dulce|galleta|tarta|cheesecake/i, '🍪'],
  [/caf/i, '☕'],
  [/mediterr/i, '🫒'],
  [/fusi/i, '🥢'],
  [/casera|horno|tortilla/i, '🍳'],
];
export const emojiFor = (category: string) => EMOJI.find(([re]) => re.test(category))?.[1] ?? '🍽️';

/** Texto tipo recibo para compartir por WhatsApp o donde sea. */
export const shareText = (r: RestaurantEntry) => {
  const s = r.scores;
  const lines = [`🧾 La Cuenta. — ${r.name}`, `${emojiFor(r.category)} ${r.category}${r.neighborhood ? ` · ${r.neighborhood}` : ''}`];
  if (s) {
    lines.push(`G ${fmtScore(s.gonzalo)} · V ${fmtScore(s.vero)} → ${fmtScore(s.average)} (${verdict(s.average)})`);
  }
  if (r.bestDish) lines.push(`★ ${r.bestDish}`);
  if (r.pricePerPerson) lines.push(`${fmtEuro(r.pricePerPerson)} por cabeza`);
  if (r.recipe?.ingredients.length) lines.push('', 'Ingredientes:', ...r.recipe.ingredients.map((i) => `• ${i}`));
  if (r.recipe?.steps.length) lines.push('', 'Pasos:', ...r.recipe.steps.map((s, k) => `${k + 1}. ${s}`));
  if (r.recipe?.sourceUrl) lines.push('', r.recipe.sourceUrl);
  return lines.join('\n');
};

/** Valida una copia de seguridad importada (acepta también el formato antiguo). */
export const parseBackup = (raw: unknown): RestaurantEntry[] => {
  const list = Array.isArray(raw) ? raw : (raw as { restaurants?: unknown } | null)?.restaurants;
  if (!Array.isArray(list)) throw new Error('El archivo no contiene una lista de sitios.');
  return list.map((r, i) => {
    const e = r as RestaurantEntry;
    if (!e || typeof e.name !== 'string' || !e.name.trim()) throw new Error(`Entrada ${i + 1}: falta el nombre.`);
    if (e.status !== 'visited' && e.status !== 'wishlist') throw new Error(`"${e.name}": estado no válido.`);
    const coords =
      Array.isArray(e.coordinates) && e.coordinates.length === 2 && e.coordinates.every(Number.isFinite)
        ? e.coordinates
        : undefined;
    return {
      ...e,
      id: e.id || uid(),
      kind: e.kind === 'recipe' ? 'recipe' : 'restaurant',
      category: e.category || 'Otros',
      coordinates: coords,
    };
  });
};

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2026-07-31" → "31 jul 2026" */
export const fmtLongDate = (iso?: string) => {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1] ?? ''} ${y}`;
};

/** Última vez que fuisteis (la primera visita o la última revisita). */
export const lastVisit = (r: RestaurantEntry) => [r.visitDate, ...(r.revisits ?? [])].filter(Boolean).sort().pop();

/** Todas las visitas (fecha original + revisitas). */
export const allVisits = (r: RestaurantEntry) => [r.visitDate, ...(r.revisits ?? [])].filter((d): d is string => !!d);

/** Ficha del sitio en Google Maps (reseñas, horario, carta). */
export const googleMapsUrl = (r: RestaurantEntry) => {
  const q = [r.name, r.address, r.address ? 'Madrid' : r.neighborhood ?? 'Madrid'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
};
