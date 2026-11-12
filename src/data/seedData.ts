export type Kind = 'restaurant' | 'recipe';

export interface Scores {
  gonzalo: number;
  vero: number;
  average: number;
  /** Detalle opcional de 1 a 5 (solo restaurantes). */
  food?: number;
  vibe?: number;
  value?: number;
}

export interface RecipeDetails {
  ingredients: string[];
  steps: string[];
  servings?: number;
  /** Minutos totales aproximados. */
  minutes?: number;
  /** TikTok, Instagram, web… de donde salió. */
  sourceUrl?: string;
}

export interface RestaurantEntry {
  id: string;
  /** Fuera (restaurante) o En casa (receta). */
  kind: Kind;
  name: string;
  category: string;
  neighborhood?: string;
  /** Calle y número del local real. */
  address?: string;
  status: 'visited' | 'wishlist';
  visitDate?: string;
  pricePerPerson?: number;
  scores?: Scores;
  bestDish?: string;
  notes?: string;
  wouldRepeat?: boolean;
  coordinates?: [number, number];
  imageUrl?: string;
  /** Solo recetas: lo necesario para cocinarla. */
  recipe?: RecipeDetails;
  /** Favorito (corazón). */
  favorite?: boolean;
  /** Teléfono y web del local (de OpenStreetMap al elegirlo, o a mano). */
  phone?: string;
  website?: string;
  /** Etiquetas libres: "Cita especial", "Terraza"… */
  tags?: string[];
  /** Otras veces que volvisteis (la primera es visitDate). Fechas AAAA-MM-DD. */
  revisits?: string[];
  /** Nivel de precio rápido (1 = €, 4 = €€€€), por si no apuntáis el precio exacto. */
  priceLevel?: 1 | 2 | 3 | 4;
  /** Última modificación (ms): decide qué versión gana al juntar copias de los dos móviles. */
  updatedAt?: number;
}

export const RESTAURANT_TYPES = ['Hamburguesas', 'Sushi', 'Italiano', 'Burrito', 'Ramen', 'Fusión', 'Mediterráneo', 'Postres / Café'];
export const RECIPE_TYPES = ['Comida casera', 'Postre', 'Pasta', 'Cena rápida', 'Horno'];

export const TAG_SUGGESTIONS = {
  restaurant: ['Cita especial', 'Terraza', 'Barato', 'Con amigos', 'Brunch', 'Vistas', 'Para llevar', 'Reservar antes'],
  recipe: ['Fácil', 'Rápida', 'Para invitados', 'Sana', 'Capricho', 'Batch cooking'],
} as const;

const s = (gonzalo: number, vero: number): Scores => ({
  gonzalo,
  vero,
  average: Math.round(((gonzalo + vero) / 2) * 100) / 100,
});

/**
 * Exactamente lo que hay en el Excel "Nuestros Restaurantes Favoritos V2":
 * nombre, fecha, tipo y las dos notas. Lo único añadido es la ubicación real
 * (OpenStreetMap) de los dos sitios que tienen un solo local en Madrid.
 */
export const INITIAL_RESTAURANTS: RestaurantEntry[] = [
  // ── Restaurantes ──
  {
    id: 'r-buffet-acacias',
    kind: 'restaurant',
    name: 'Buffet Sushi Acacias',
    category: 'Sushi',
    status: 'visited',
    visitDate: '2026-06-09',
    scores: s(7.5, 8),
  },
  {
    id: 'r-tagliatella',
    kind: 'restaurant',
    name: 'La Tagliatella',
    category: 'Italiano',
    status: 'visited',
    visitDate: '2026-06-16',
    scores: s(8.5, 9.3),
  },
  {
    id: 'r-burmet',
    kind: 'restaurant',
    name: 'Burmet',
    category: 'Hamburguesas',
    status: 'visited',
    visitDate: '2026-07-31',
    scores: s(9.5, 9.8),
    neighborhood: 'Arganzuela',
    address: 'Paseo de los Olmos 13',
    coordinates: [40.40444, -3.7106],
  },
  {
    id: 'r-fogg',
    kind: 'restaurant',
    name: 'FOGG Bar',
    category: 'Hamburguesas',
    status: 'visited',
    visitDate: '2026-09-23',
    scores: s(9, 8.7),
    neighborhood: 'Retiro',
    address: 'Plaza Reyes Magos 6',
    coordinates: [40.40811, -3.67658],
  },
  {
    id: 'r-sushi-alcampo',
    kind: 'restaurant',
    name: 'Sushi Alcampo + atardecer',
    category: 'Sushi',
    status: 'visited',
    visitDate: '2026-10-10',
    scores: s(9.2, 9.8),
  },
  {
    id: 'r-tierra-burrito',
    kind: 'restaurant',
    name: 'Tierra Burrito',
    category: 'Burrito',
    status: 'visited',
    visitDate: '2026-10-03',
    scores: s(8.5, 8.5),
  },
  // ── Recetas ──
  {
    id: 'c-galletas',
    kind: 'recipe',
    name: 'Galletas',
    category: 'Postre',
    status: 'visited',
    visitDate: '2026-10-31',
    scores: s(9.25, 9.75),
  },
  {
    id: 'c-cheesecake',
    kind: 'recipe',
    name: 'Marron velvet cheesecake',
    category: 'Postre',
    status: 'visited',
    visitDate: '2026-11-09',
    scores: s(8, 8.5),
  },
  {
    id: 'c-mac',
    kind: 'recipe',
    name: 'Mac and cheese',
    category: 'Comida casera',
    status: 'visited',
    visitDate: '2026-10-11',
    scores: s(9, 9),
  },
  {
    id: 'c-tortilla',
    kind: 'recipe',
    name: 'Tortilla casera',
    category: 'Comida casera',
    status: 'visited',
    visitDate: '2026-10-12',
    scores: s(9.5, 10),
  },
];

/** IDs de datos de ejemplo de versiones anteriores, que ya no deben existir. */
export const LEGACY_SEED_IDS = ['rest-1', 'rest-2', 'rest-3', 'rest-4', 'rest-5', 'rest-6', 'r-grosso', 'r-sdd', 'r-kagura'];
