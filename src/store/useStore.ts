import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { del, get as idbGet, set as idbSet } from 'idb-keyval';
import { INITIAL_RESTAURANTS, LEGACY_SEED_IDS, type Kind, type RestaurantEntry } from '../data/seedData';
import { sanitizeEntry } from '../lib/utils';

export type SortKey = 'score' | 'recent' | 'gonzalo' | 'vero';

interface Settings {
  /** Recordatorio de los viernes (solo app). */
  reminder: boolean;
  sort: SortKey;
}

interface State {
  restaurants: RestaurantEntry[];
  /** Pestaña global: Fuera (restaurantes) o En casa (recetas). */
  mode: Kind;
  settings: Settings;
  setMode: (m: Kind) => void;
  setSettings: (s: Partial<Settings>) => void;
  upsert: (entry: RestaurantEntry) => void;
  toggleFavorite: (id: string) => void;
  remove: (id: string) => void;
  replaceAll: (entries: RestaurantEntry[]) => void;
  /** Junta una copia del otro móvil: gana la versión más reciente de cada entrada. */
  mergeAll: (entries: RestaurantEntry[]) => { added: number; updated: number };
  reset: () => void;
  /** Aviso efímero (no se guarda) con acción opcional de deshacer. */
  toast: { id: number; text: string; undo?: () => void } | null;
  showToast: (text: string, undo?: () => void) => void;
  hideToast: () => void;
  /** Borra y ofrece deshacer. */
  removeWithUndo: (id: string) => void;
  /** Lápidas: id → cuándo se borró (ms). Sirven para que el borrado llegue al otro móvil. */
  tombstones: Record<string, number>;
  /** Aplica lo que llega de la nube (no vuelve a marcar fechas, para no rebotar cambios). */
  applyRemote: (upserts: RestaurantEntry[], deletes: { id: string; at: number }[]) => void;
}

const KEY = 'la-cuenta-store';

/**
 * IndexedDB (cientos de MB, caben muchas fotos) con lo de localStorage como respaldo:
 * la primera vez se trae lo que hubiera guardado la versión anterior.
 */
const idbStorage: StateStorage = {
  getItem: async (k) => {
    try {
      const v = await idbGet<string>(k);
      if (v != null) return v;
    } catch {
      /* IndexedDB no disponible */
    }
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: async (k, v) => {
    try {
      await idbSet(k, v);
      try {
        localStorage.removeItem(k); // ya vive en IndexedDB
      } catch {
        /* nada */
      }
    } catch {
      try {
        localStorage.setItem(k, v);
      } catch {
        useStore.getState().showToast('Memoria llena: no se guardó. Quita alguna foto o exporta una copia.');
      }
    }
  },
  removeItem: async (k) => {
    await del(k).catch(() => {});
  },
};

const stamp = (e: RestaurantEntry): RestaurantEntry => ({ ...sanitizeEntry(e), updatedAt: Date.now() });
const withoutKey = (o: Record<string, number>, k: string) => {
  if (!(k in o)) return o;
  const n = { ...o };
  delete n[k];
  return n;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      restaurants: INITIAL_RESTAURANTS,
      mode: 'restaurant',
      settings: { reminder: false, sort: 'score' },
      setMode: (mode) => set({ mode }),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      tombstones: {},
      upsert: (entry) =>
        set((s) => {
          const e = stamp(entry);
          const exists = s.restaurants.some((r) => r.id === e.id);
          return {
            restaurants: exists ? s.restaurants.map((r) => (r.id === e.id ? e : r)) : [e, ...s.restaurants],
            tombstones: withoutKey(s.tombstones, e.id),
          };
        }),
      toggleFavorite: (id) =>
        set((s) => ({ restaurants: s.restaurants.map((r) => (r.id === id ? stamp({ ...r, favorite: !r.favorite }) : r)) })),
      remove: (id) =>
        set((s) => ({ restaurants: s.restaurants.filter((r) => r.id !== id), tombstones: { ...s.tombstones, [id]: Date.now() } })),
      // Reemplazar o volver al Excel: lo que desaparece se marca como borrado y lo nuevo gana (también en el otro móvil).
      replaceAll: (entries) =>
        set((s) => {
          const now = Date.now();
          const keep = new Set(entries.map((e) => e.id));
          const tomb = { ...s.tombstones };
          s.restaurants.forEach((r) => !keep.has(r.id) && (tomb[r.id] = now));
          entries.forEach((e) => delete tomb[e.id]);
          return { restaurants: entries.map((e) => ({ ...sanitizeEntry(e), updatedAt: now })), tombstones: tomb };
        }),
      mergeAll: (entries) => {
        let added = 0;
        let updated = 0;
        const { tombstones } = get();
        const map = new Map(get().restaurants.map((r) => [r.id, r]));
        for (const e of entries.map(sanitizeEntry)) {
          const cur = map.get(e.id);
          if (!cur) {
            if ((tombstones[e.id] ?? -1) >= (e.updatedAt ?? 0)) continue; // lo borrasteis después
            map.set(e.id, e);
            added++;
          } else if ((e.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
            map.set(e.id, e);
            updated++;
          }
        }
        set({ restaurants: [...map.values()] });
        return { added, updated };
      },
      reset: () => get().replaceAll(INITIAL_RESTAURANTS),
      applyRemote: (upserts, deletes) =>
        set((s) => {
          const map = new Map(s.restaurants.map((r) => [r.id, r]));
          const tomb = { ...s.tombstones };
          for (const e of upserts.map(sanitizeEntry)) {
            const cur = map.get(e.id);
            const t = (e.updatedAt ?? 0);
            if ((tomb[e.id] ?? -1) >= t) continue;
            if (!cur || t > (cur.updatedAt ?? 0)) map.set(e.id, e);
          }
          for (const d of deletes) {
            const cur = map.get(d.id);
            if (cur && (cur.updatedAt ?? 0) > d.at) continue; // aquí se editó después
            map.delete(d.id);
            tomb[d.id] = Math.max(tomb[d.id] ?? 0, d.at);
          }
          // Mantener el orden actual y poner lo nuevo delante.
          const known = new Set(s.restaurants.map((r) => r.id));
          const fresh = [...map.values()].filter((r) => !known.has(r.id));
          const kept = s.restaurants.filter((r) => map.has(r.id)).map((r) => map.get(r.id)!);
          return { restaurants: [...fresh, ...kept], tombstones: tomb };
        }),
      toast: null,
      showToast: (text, undo) => set({ toast: { id: Date.now(), text, undo } }),
      hideToast: () => set({ toast: null }),
      removeWithUndo: (id) => {
        const list = get().restaurants;
        const idx = list.findIndex((r) => r.id === id);
        if (idx < 0) return;
        const entry = list[idx];
        set((s) => ({ restaurants: list.filter((r) => r.id !== id), tombstones: { ...s.tombstones, [id]: Date.now() } }));
        get().showToast(`${entry.name} eliminado`, () =>
          set((s) => {
            const next = [...s.restaurants];
            next.splice(Math.min(idx, next.length), 0, stamp(entry));
            return { restaurants: next, tombstones: withoutKey(s.tombstones, id) };
          })
        );
      },
    }),
    {
      name: KEY,
      version: 5,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ restaurants: s.restaurants, mode: s.mode, settings: s.settings, tombstones: s.tombstones }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          restaurants: (p.restaurants ?? current.restaurants).map(sanitizeEntry),
          settings: { ...current.settings, ...(p.settings ?? {}) },
        };
      },
      migrate: (persisted, version) => {
        let state = (version >= 4 ? persisted : toV4(persisted)) as State;
        // → v5: el formulario marcaba "Repetimos: sí" sin que lo eligierais. Se quitan esos "sí"
        // (los "no" sí fueron vuestros). Sin tocar updatedAt, para no reenviarlos a la nube.
        if (version < 5) {
          state = {
            ...state,
            restaurants: (state.restaurants ?? []).map((r) => {
              if (r.wouldRepeat !== true) return r;
              const { wouldRepeat: _w, ...rest } = r;
              void _w;
              return rest;
            }),
          };
        }
        return state;
      },
    }
  )
);

/** Migración a v4: solo los datos del Excel (conservando lo vuestro). */
function toV4(persisted: unknown) {
        const old = (persisted ?? {}) as { restaurants?: RestaurantEntry[]; mode?: Kind; settings?: Settings };
        // → v4: solo los datos del Excel. Lo añadido a mano se conserva tal cual; de las entradas
        // del Excel se respeta lo que pusisteis vosotros: ubicación, foto propia y receta.
        const seed = new Map(INITIAL_RESTAURANTS.map((r) => [r.id, r]));
        const oldById = new Map((old.restaurants ?? []).map((r) => [r.id, r]));
        const own = (old.restaurants ?? []).filter((r) => !seed.has(r.id) && !LEGACY_SEED_IDS.includes(r.id));
        const fromExcel = INITIAL_RESTAURANTS.map((clean) => {
          const prev = oldById.get(clean.id);
          if (!prev) return clean;
          return {
            ...clean,
            ...(prev.coordinates && !seed.get(clean.id)!.coordinates
              ? { coordinates: prev.coordinates, address: prev.address, neighborhood: prev.neighborhood }
              : {}),
            ...(prev.imageUrl?.startsWith('data:') ? { imageUrl: prev.imageUrl } : {}),
            ...(prev.recipe ? { recipe: prev.recipe } : {}),
          };
        });
        return {
          restaurants: [...own.map((r) => ({ ...r, kind: r.kind ?? 'restaurant' })), ...fromExcel],
          mode: old.mode ?? 'restaurant',
          settings: old.settings ?? { reminder: false, sort: 'score' },
        } as State;
}
