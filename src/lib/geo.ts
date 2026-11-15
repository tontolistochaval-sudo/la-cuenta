/**
 * Ubicación real de los sitios con OpenStreetMap (Nominatim).
 * Uso ligero y educado: ~1 petición por segundo como mucho (la búsqueda al escribir va con pausa).
 */

import { tomtomPlaces } from './ai';

export interface Place {
  name: string;
  address?: string;
  neighborhood?: string;
  coordinates: [number, number];
  /** restaurant, fast_food, bar… (si es un local) */
  type?: string;
  /** metros hasta el usuario */
  distance?: number;
  /** Datos del local en OpenStreetMap, si los tiene. */
  phone?: string;
  website?: string;
  cuisine?: string;
}

export interface SearchResult {
  places: Place[];
  /** Si no había nada tal cual y sí con una corrección ("tagliatela" → "tagliatella"). */
  corrected?: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const MADRID_BOX = '-3.89,40.56,-3.52,40.31';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

const FOOD_TYPES = new Set(['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream', 'food_court', 'biergarten']);

const round5 = (n: number) => Number(n.toFixed(5));

const hoodOf = (a?: Record<string, string>) => a?.suburb ?? a?.quarter ?? a?.neighbourhood ?? a?.city_district;

const addressOf = (a?: Record<string, string>) => {
  if (!a) return undefined;
  const street = a.road ?? a.pedestrian ?? a.square ?? a.footway;
  if (!street) return undefined;
  return a.house_number ? `${street} ${a.house_number}` : street;
};

const toPlace = (r: NominatimResult): Place => {
  const t = r.extratags ?? {};
  return {
    name: r.name || r.display_name.split(',')[0],
    address: addressOf(r.address),
    neighborhood: hoodOf(r.address),
    coordinates: [round5(Number(r.lat)), round5(Number(r.lon))],
    type: FOOD_TYPES.has(r.type ?? '') ? r.type : undefined,
    phone: t.phone ?? t['contact:phone'],
    website: t.website ?? t['contact:website'],
    cuisine: t.cuisine,
  };
};

/** Tipo de la app a partir de la cocina de OpenStreetMap (burger → Hamburguesas…). */
export function categoryFromCuisine(cuisine?: string): string | undefined {
  if (!cuisine) return undefined;
  const c = cuisine.toLowerCase();
  const map: [RegExp, string][] = [
    [/burger/, 'Hamburguesas'],
    [/sushi|japanese/, 'Sushi'],
    [/ramen/, 'Ramen'],
    [/pizza|italian/, 'Italiano'],
    [/mexican|burrito|tex-mex/, 'Burrito'],
    [/mediterranean|spanish|tapas/, 'Mediterráneo'],
    [/coffee|cafe|cake|dessert|ice_cream/, 'Postres / Café'],
    [/fusion|asian|korean|thai|chinese|vietnamese|indian|peruvian/, 'Fusión'],
  ];
  return map.find(([re]) => re.test(c))?.[1];
}

/**
 * Erratas típicas al escribir nombres de locales: letras dobles que faltan o sobran
 * ("tagliatela" → "tagliatella", "pizeria" → "pizzeria") y b/v. De más a menos probable.
 */
export function typoVariants(q: string): string[] {
  const s = q.toLowerCase().trim();
  const out: string[] = [];
  const add = (v: string) => v !== s && !out.includes(v) && out.push(v);
  const vowel = (c?: string) => !!c && /[aeiouáéíóú]/.test(c);
  // Doblar una consonante entre vocales, empezando por el final (donde suelen estar las dobles).
  for (let i = s.length - 2; i > 0; i--) {
    const c = s[i];
    if ('lrtnczpsfgm'.includes(c) && vowel(s[i - 1]) && vowel(s[i + 1])) add(s.slice(0, i) + c + s.slice(i));
  }
  // Quitar una letra doble.
  for (let i = s.length - 1; i > 0; i--) if (s[i] === s[i - 1] && /[a-z]/.test(s[i])) add(s.slice(0, i) + s.slice(i + 1));
  // b ↔ v
  const bv = s.search(/[bv]/);
  if (bv >= 0) add(s.slice(0, bv) + (s[bv] === 'b' ? 'v' : 'b') + s.slice(bv + 1));
  return out;
}

/** Distancia en metros (haversine). */
export function distance([a1, o1]: [number, number], [a2, o2]: [number, number]) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dA = (a2 - a1) * rad;
  const dO = (o2 - o1) * rad;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * rad) * Math.cos(a2 * rad) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

async function nominatim(params: string, signal?: AbortSignal): Promise<NominatimResult[]> {
  const res = await fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&extratags=1&accept-language=es&${params}`, { signal });
  if (!res.ok) throw new Error('El buscador no responde ahora.');
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string>;
}

/** Photon (Komoot): mejor con nombres parciales ("Tierra Burrito" → "Tierra Burrito Bar"). Puede ir lento: tiempo límite. */
async function photon(q: string, signal?: AbortSignal): Promise<Place[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=8&lat=40.4168&lon=-3.7038&bbox=-3.89,40.31,-3.52,40.56&q=${encodeURIComponent(q)}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { features: PhotonFeature[] };
    return data.features
      .filter((f) => f.properties.name)
      .map((f) => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        return {
          name: p.name,
          address: p.street ? (p.housenumber ? `${p.street} ${p.housenumber}` : p.street) : undefined,
          neighborhood: p.district ?? p.locality,
          coordinates: [round5(lat), round5(lon)] as [number, number],
          type: FOOD_TYPES.has(p.osm_value) ? p.osm_value : undefined,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Locales de comida primero; dentro de cada grupo, lo más cercano a vosotros (si se sabe dónde estáis). */
const rank = (list: Place[], near?: [number, number]) =>
  list
    .map((p) => (near ? { ...p, distance: distance(near, p.coordinates) } : p))
    .sort((a, b) => Number(!!b.type) - Number(!!a.type) || (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, 10);

/** Une listas sin duplicados (mismo sitio = a menos de 40 m). */
const mergePlaces = (base: Place[], extra: Place[]) => {
  const out = [...base];
  for (const p of extra) if (!out.some((m) => distance(m.coordinates, p.coordinates) < 40)) out.push(p);
  return out;
};

/** Última posición conocida (para ordenar resultados por cercanía sin volver a pedir el GPS). */
let lastKnown: [number, number] | undefined;
export const rememberPosition = (c: [number, number]) => (lastKnown = c);

const inMadrid = (q: string, signal?: AbortSignal) =>
  nominatim(`limit=10&viewbox=${MADRID_BOX}&bounded=1&q=${encodeURIComponent(q)}`, signal).then((d) => d.map(toPlace));

/**
 * Busca un sitio por nombre o dirección en Madrid:
 *  1. Tal cual (Nominatim). Photon, si responde, añade más locales después por `onMore`.
 *  2. Si no hay nada, prueba erratas típicas (letras dobles, b/v) y avisa de la corrección.
 *  3. Si sigue sin haber nada, Photon y después toda España.
 */
export async function searchPlaces(
  q: string,
  opts: { signal?: AbortSignal; onMore?: (r: SearchResult) => void; quick?: boolean } = {}
): Promise<SearchResult> {
  const { signal, onMore, quick } = opts;
  const near = lastKnown;
  const photonP = photon(q, signal);
  // TomTom (negocios que no están en OpenStreetMap) a la vez que Nominatim.
  const [nomi, tomtom] = await Promise.all([inMadrid(q, signal), tomtomPlaces(q, near)]);
  let places = mergePlaces(tomtom.filter((p) => p.type), mergePlaces(nomi, tomtom));
  let corrected: string | undefined;

  if (places.length < 3 && !tomtom.length) {
    // Pocos o ningún resultado: probar erratas típicas y juntar lo que salga.
    // Al escribir (quick) solo la más probable, para no saturar el buscador.
    for (const v of typoVariants(q).slice(0, quick ? 1 : 3)) {
      await sleep(1100);
      if (signal?.aborted) return { places: [] };
      const r = await inMadrid(v, signal);
      if (r.length) {
        places = mergePlaces(r, places);
        corrected = v;
        break;
      }
    }
  }

  if (!places.length) {
    places = await photonP;
    if (!places.length && !quick) {
      await sleep(1100);
      places = (await nominatim(`limit=8&countrycodes=es&q=${encodeURIComponent(q)}`, signal)).map(toPlace);
    }
    return { places: rank(places, near), corrected };
  }

  photonP.then((extra) => {
    if (signal?.aborted || !extra.length) return;
    const all = mergePlaces(places, extra);
    if (all.length > places.length) onMore?.({ places: rank(all, near), corrected });
  });
  return { places: rank(places, near), corrected };
}

/** Locales de comida a ~200 m. Va devolviendo resultados según llegan (1 petición/seg). */
export async function nearbyPlaces(
  [lat, lon]: [number, number],
  onUpdate: (places: Place[]) => void,
  signal?: AbortSignal
) {
  const dLat = 0.0018;
  const dLon = 0.0024;
  const box = `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
  const found = new Map<string, Place>();
  for (const [k, tag] of ['restaurant', 'fast_food', 'bar', 'cafe'].entries()) {
    if (k > 0) await sleep(1100);
    if (signal?.aborted) return;
    try {
      const data = await nominatim(`limit=15&bounded=1&viewbox=${box}&q=${encodeURIComponent(`[${tag}]`)}`, signal);
      for (const r of data) {
        const p = toPlace(r);
        if (!p.name) continue;
        found.set(`${p.name}|${p.coordinates.join()}`, { ...p, distance: distance([lat, lon], p.coordinates) });
      }
      onUpdate([...found.values()].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
}

/** Dirección y barrio de un punto (para "ajustar en el mapa"). */
export async function reverse([lat, lon]: [number, number]): Promise<Partial<Place>> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=es&lat=${lat}&lon=${lon}`
    );
    if (!res.ok) return {};
    const r = (await res.json()) as NominatimResult;
    return { address: addressOf(r.address), neighborhood: hoodOf(r.address) };
  } catch {
    return {};
  }
}

// GPS nativo en la app, navegador en la web.
export { currentPosition } from './native';

/**
 * Lo que se pega desde Google Maps / Apple Maps:
 *  - un enlace largo con coordenadas (@lat,lng · !3dlat!4dlng · ?q=lat,lng · ll=lat,lng)
 *  - o el texto de "Compartir" (nombre + dirección + enlace corto), que se usa como búsqueda.
 */
export function parseShared(text: string): { coordinates?: [number, number]; name?: string; query?: string } {
  const t = text.trim();
  const decoded = (() => {
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  })();
  const num = '(-?\\d{1,3}\\.\\d+)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`), // punto exacto del sitio en Google Maps
    new RegExp(`[?&](?:q|query|ll|daddr|destination)=${num},\\s*${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`^${num}\\s*,\\s*${num}$`),
  ];
  let coordinates: [number, number] | undefined;
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        coordinates = [round5(lat), round5(lng)];
        break;
      }
    }
  }
  const placeName = decoded.match(/\/maps\/place\/([^/@?]+)/)?.[1]?.replace(/\+/g, ' ');
  const lines = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\//i.test(l));
  return {
    coordinates,
    name: placeName || lines[0],
    query: lines.length ? lines.slice(0, 2).join(', ') : placeName,
  };
}
