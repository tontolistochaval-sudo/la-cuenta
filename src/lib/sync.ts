/**
 * Sincronización entre los móviles de Gonzalo y Vero con Supabase.
 *
 * - Cada móvil guarda todo en local (funciona sin conexión) y la nube es el punto de encuentro.
 * - Una "mesa" agrupa a los dos: uno la crea y el otro se une con su código.
 * - Cada entrada lleva `updatedAt`: al encontrarse dos versiones, gana la más reciente.
 * - Los borrados viajan como "lápidas" para que el otro móvil también los quite.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { App as CapApp } from '@capacitor/app';
import { useStore } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { isNative } from './native';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** ¿Está la app compilada con los datos del proyecto de Supabase? */
export const syncConfigured = !!(URL_ && KEY_);

export const supabase: SupabaseClient | null = syncConfigured
  ? createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

interface Mesa {
  id: string;
  codigo: string;
}

interface Row {
  mesa_id: string;
  id: string;
  datos: RestaurantEntry | null;
  actualizado: number;
  borrado: boolean;
}

type Status = 'off' | 'login' | 'mesa' | 'syncing' | 'ok' | 'offline' | 'error';

interface SyncState {
  status: Status;
  email?: string;
  mesa?: Mesa;
  members?: number;
  lastSync?: number;
  error?: string;
}

export const useSync = create<SyncState>(() => ({ status: syncConfigured ? 'login' : 'off' }));
const setSync = (p: Partial<SyncState>) => useSync.setState(p);

/** Lo que la nube tiene de cada entrada (id → actualizado), para no subir lo que ya está. */
let remote = new Map<string, number>();
let channel: RealtimeChannel | null = null;
let pushTimer: number | undefined;
let pushing = false;

const msg = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar el email (mira tu correo) o desactivar la confirmación en Supabase.';
  if (/already registered|already been registered/i.test(m)) return 'Ese email ya tiene cuenta: usa «Entrar».';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Se sincronizará cuando vuelva internet.';
  return m;
};

/* ─────────── Sesión y mesa ─────────── */

export async function initSync() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return setSync({ status: 'login' });
  setSync({ email: data.session.user.email ?? undefined });
  await loadMesa();
}

async function loadMesa() {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('mi_mesa');
  if (error) return setSync({ status: navigator.onLine ? 'error' : 'offline', error: msg(error) });
  const mesa = (data as Mesa[] | null)?.[0];
  if (!mesa) return setSync({ status: 'mesa', mesa: undefined });
  setSync({ mesa });
  await startSync();
}

export async function signIn(email: string, password: string, create: boolean) {
  if (!supabase) return;
  setSync({ error: undefined });
  const fn = create ? supabase.auth.signUp({ email, password }) : supabase.auth.signInWithPassword({ email, password });
  const { data, error } = await fn;
  if (error) return setSync({ error: msg(error) });
  if (!data.session) return setSync({ error: 'Cuenta creada. Confirma el email que te ha llegado y luego pulsa «Entrar».' });
  setSync({ email: data.session.user.email ?? email });
  await loadMesa();
}

export async function signOut() {
  stopSync();
  await supabase?.auth.signOut();
  remote = new Map();
  setSync({ status: 'login', email: undefined, mesa: undefined, members: undefined, lastSync: undefined, error: undefined });
}

export async function createMesa() {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('crear_mesa');
  if (error) return setSync({ error: msg(error) });
  setSync({ mesa: (data as Mesa[])[0], error: undefined });
  await startSync();
}

export async function joinMesa(codigo: string) {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('unirse_mesa', { p_codigo: codigo.trim().toUpperCase() });
  if (error) return setSync({ error: msg(error) });
  setSync({ mesa: (data as Mesa[])[0], error: undefined });
  await startSync();
}

/* ─────────── Sincronizar ─────────── */

async function startSync() {
  await syncNow();
  subscribe();
}

function stopSync() {
  if (channel) supabase?.removeChannel(channel);
  channel = null;
}

/** Baja todo lo de la mesa, lo mezcla con lo local y sube lo que falte. */
export async function syncNow() {
  const { mesa } = useSync.getState();
  if (!supabase || !mesa) return;
  setSync({ status: 'syncing', error: undefined });
  try {
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('entradas')
        .select('mesa_id,id,datos,actualizado,borrado')
        .eq('mesa_id', mesa.id)
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...((data as Row[]) ?? []));
      if (!data || data.length < 1000) break;
    }
    remote = new Map(rows.map((r) => [r.id, r.actualizado]));
    applyRows(rows);
    await push();
    const { data: n } = await supabase.rpc('miembros_de_mi_mesa');
    setSync({ status: 'ok', lastSync: Date.now(), members: typeof n === 'number' ? n : undefined });
  } catch (e) {
    setSync({ status: navigator.onLine ? 'error' : 'offline', error: msg(e) });
  }
}

function applyRows(rows: Row[]) {
  const upserts = rows.filter((r) => !r.borrado && r.datos).map((r) => ({ ...r.datos!, updatedAt: r.actualizado }));
  const deletes = rows.filter((r) => r.borrado).map((r) => ({ id: r.id, at: r.actualizado }));
  if (upserts.length || deletes.length) useStore.getState().applyRemote(upserts, deletes);
}

/** Sube lo que aquí es más nuevo que en la nube (entradas y borrados). */
async function push() {
  const { mesa } = useSync.getState();
  if (!supabase || !mesa || pushing) return;
  pushing = true;
  try {
    const { restaurants, tombstones } = useStore.getState();
    const rows: Row[] = [];
    for (const r of restaurants) {
      const at = r.updatedAt ?? 0;
      const known = remote.get(r.id);
      if (known === undefined || at > known) rows.push({ mesa_id: mesa.id, id: r.id, datos: r, actualizado: at, borrado: false });
    }
    for (const [id, at] of Object.entries(tombstones)) {
      const known = remote.get(id);
      if (known === undefined ? restaurants.every((r) => r.id !== id) : at > known)
        rows.push({ mesa_id: mesa.id, id, datos: null, actualizado: at, borrado: true });
    }
    for (let k = 0; k < rows.length; k += 50) {
      const chunk = rows.slice(k, k + 50);
      const { error } = await supabase.from('entradas').upsert(chunk, { onConflict: 'mesa_id,id' });
      if (error) throw error;
      chunk.forEach((r) => remote.set(r.id, r.actualizado));
    }
    if (rows.length) setSync({ lastSync: Date.now(), status: 'ok' });
  } catch (e) {
    setSync({ status: navigator.onLine ? 'error' : 'offline', error: msg(e) });
  } finally {
    pushing = false;
  }
}

/** Cambios del otro móvil al momento. */
function subscribe() {
  const { mesa } = useSync.getState();
  if (!supabase || !mesa) return;
  stopSync();
  channel = supabase
    .channel(`mesa-${mesa.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `mesa_id=eq.${mesa.id}` }, (p) => {
      const row = p.new as Row | undefined;
      if (!row?.id) return;
      remote.set(row.id, Math.max(remote.get(row.id) ?? 0, row.actualizado));
      applyRows([row]);
      setSync({ lastSync: Date.now() });
    })
    .subscribe();
}

/* ─────────── Arranque ─────────── */

let started = false;

/** Se llama una vez al abrir la app (cuando ya están cargados los datos locales). */
export function bootSync() {
  if (!supabase || started) return;
  started = true;
  initSync();

  // Lo que cambia aquí sube solo, con una pequeña pausa para agrupar cambios.
  useStore.subscribe((s, prev) => {
    if (s.restaurants === prev.restaurants && s.tombstones === prev.tombstones) return;
    if (!useSync.getState().mesa) return;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(push, 1200);
  });

  // Al volver a la app o recuperar internet, ponerse al día.
  const resync = () => useSync.getState().mesa && syncNow();
  window.addEventListener('online', resync);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && resync());
  if (isNative) CapApp.addListener('resume', resync);
}
