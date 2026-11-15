/**
 * IA (Gemini) a través de la Edge Function "gemini" de Supabase.
 * La clave de Gemini vive en Supabase, nunca en la app: solo funciona con la sesión
 * de "Juntos en la nube" iniciada.
 */
import { supabase, useSync } from './sync';
import type { RestaurantEntry } from '../data/seedData';

export interface AIRecipe {
  title?: string;
  category?: string;
  servings?: number;
  minutes?: number;
  ingredients: string[];
  tools?: string[];
  steps: string[];
  tips?: string[];
}

export interface AIPlace {
  name: string;
  category?: string;
  neighborhood?: string;
  address?: string;
  priceLevel?: number;
  why?: string;
  dish?: string;
  /** Sitio vuestro en el que se basa la sugerencia (mismo tipo de cocina). */
  basedOn?: string | null;
}

export type DiscoverFocus = 'parecido' | 'zonas' | 'nuevo';

/** ¿Se puede usar la IA ahora mismo? Devuelve el motivo si no. */
export function aiUnavailable(): string | null {
  if (!supabase) return 'La IA necesita la nube configurada.';
  if (!useSync.getState().email) return 'Para usar la IA, entra en Ajustes → Juntos en la nube.';
  if (!navigator.onLine) return 'Sin conexión: la IA necesita internet.';
  return null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const why = aiUnavailable();
  if (why) throw new Error(why);
  const { data, error } = await supabase!.functions.invoke('gemini', { body });
  if (error) {
    // Intentar leer el mensaje que devuelve la función.
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      } catch {
        /* nada */
      }
    }
    if (/Requested function was not found/i.test(msg) || (ctx?.status === 404 && !/Gemini/i.test(msg)))
      msg = 'Falta subir la función "gemini" a Supabase.';
    if (/Failed to send|fetch/i.test(msg)) msg = 'No se pudo contactar con la IA. Revisa la conexión.';
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Convierte cualquier texto (o enlace) en una receta ordenada. */
export async function aiRecipe(text: string) {
  return call<{ recipe: AIRecipe; sourceUrl?: string; provider?: string }>({ task: 'recipe', text });
}

/** Recomendaciones de sitios reales según lo que ya habéis ido. */
export async function aiDiscover(all: RestaurantEntry[], focus: DiscoverFocus, wish: string) {
  const visited = all
    .filter((r) => r.kind === 'restaurant' && r.status === 'visited' && r.scores)
    .sort((a, b) => b.scores!.average - a.scores!.average)
    .map((r) => ({
      name: r.name,
      category: r.category,
      neighborhood: r.neighborhood,
      average: r.scores!.average,
      gonzalo: r.scores!.gonzalo,
      vero: r.scores!.vero,
    }));
  const wishlist = all.filter((r) => r.kind === 'restaurant' && r.status === 'wishlist').map((r) => r.name);
  return call<{ places: AIPlace[]; provider?: string; grounded?: boolean }>({ task: 'discover', visited, wishlist, focus, wish, city: 'Madrid' });
}

/** Búsqueda de sitios con TomTom (vía la función, para no exponer la clave). Sin sesión o sin clave: nada. */
export async function tomtomPlaces(q: string, near?: [number, number]): Promise<import('./geo').Place[]> {
  if (aiUnavailable()) return [];
  try {
    const r = await call<{ places: import('./geo').Place[] }>({ task: 'places', q, near });
    return r.places ?? [];
  } catch {
    return [];
  }
}

/** Abre un enlace corto de Google Maps (maps.app.goo.gl) y devuelve la dirección completa con las coordenadas. */
export async function resolveMapsLink(url: string): Promise<string | null> {
  if (aiUnavailable()) return null;
  try {
    return (await call<{ url: string }>({ task: 'resolve', url })).url ?? null;
  } catch {
    return null;
  }
}
