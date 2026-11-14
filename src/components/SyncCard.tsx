import { useState } from 'react';
import { ChevronDown, Cloud, CloudOff, Copy, LoaderCircle, LogOut, RefreshCw, Users } from 'lucide-react';
import { Card, ICON, Kicker } from './ui';
import { createMesa, joinMesa, signIn, signOut, syncConfigured, syncNow, useSync } from '../lib/sync';
import { haptic, shareText } from '../lib/native';
import { useStore } from '../store/useStore';

const input =
  'w-full rounded-xl border border-transparent bg-sand px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/70 outline-none focus:border-terracotta/50 focus:bg-cream';

const ago = (t?: number) => {
  if (!t) return 'nunca';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
};

/** Sincronización con Supabase: entrar, crear o unirse a la mesa, y ver el estado. */
export default function SyncCard() {
  const s = useSync();
  const showToast = useStore((st) => st.showToast);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const spinner = (k: string) => busy === k && <LoaderCircle size={16} className="animate-spin" />;

  if (!syncConfigured) {
    return (
      <Card className="p-5">
        <Kicker>Juntos en la nube</Kicker>
        <p className="mt-1 text-[14px] text-muted">
          Falta conectar la base de datos (Supabase). Mientras tanto podéis pasaros las copias a mano aquí abajo.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Kicker>Juntos en la nube</Kicker>
        {s.mesa && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              s.status === 'ok' ? 'bg-sage/15 text-sage' : s.status === 'syncing' ? 'bg-sand text-muted' : 'bg-terracotta/10 text-terracotta-dark'
            }`}
          >
            {s.status === 'syncing' ? (
              <LoaderCircle size={12} className="animate-spin" />
            ) : s.status === 'ok' ? (
              <Cloud size={12} {...ICON} />
            ) : (
              <CloudOff size={12} {...ICON} />
            )}
            {s.status === 'ok' ? 'Al día' : s.status === 'syncing' ? 'Sincronizando' : s.status === 'offline' ? 'Sin conexión' : 'Error'}
          </span>
        )}
      </div>

      {/* 1 · Entrar */}
      {s.status === 'login' && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('in', () => signIn(email.trim(), password, false));
          }}
        >
          <p className="text-[13.5px] text-muted">
            Cada uno entra con su email. Lo que apunte uno aparece solo en el móvil del otro (Android o iPhone).
          </p>
          <input className={input} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" aria-label="Email" />
          <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 6)" aria-label="Contraseña" />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="submit" disabled={!email || password.length < 6 || !!busy} className="flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14px] font-semibold text-paper disabled:opacity-40">
              {spinner('in')} Entrar
            </button>
            <button
              type="button"
              disabled={!email || password.length < 6 || !!busy}
              onClick={() => run('up', () => signIn(email.trim(), password, true))}
              className="flex items-center justify-center gap-2 rounded-full bg-sand py-3 text-[14px] font-semibold disabled:opacity-40"
            >
              {spinner('up')} Crear cuenta
            </button>
          </div>
        </form>
      )}

      {/* 2 · Crear la mesa o unirse */}
      {s.status === 'mesa' && (
        <div className="mt-3 space-y-3">
          <p className="text-[13.5px] text-muted">
            Hola, <b className="text-ink">{s.email}</b>. Uno de los dos crea la mesa y el otro se une con su código.
          </p>
          <button
            type="button"
            onClick={() => run('create', createMesa)}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {spinner('create') || <Users size={16} {...ICON} />} Crear nuestra mesa
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run('join', () => joinMesa(code));
            }}
          >
            <input
              className={`${input} font-mono tracking-[0.2em] uppercase`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="CÓDIGO"
              aria-label="Código de la mesa"
              autoCapitalize="characters"
            />
            <button type="submit" disabled={code.length < 6 || !!busy} className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper disabled:opacity-40">
              {spinner('join')} Unirme
            </button>
          </form>
          <button type="button" onClick={() => signOut()} className="text-[12.5px] text-muted underline">
            Salir
          </button>
        </div>
      )}

      {/* 3 · Conectados */}
      {s.mesa && s.status !== 'mesa' && s.status !== 'login' && (
        <div className="mt-2">
          {/* A la vista solo lo útil: con quién, cuándo y sincronizar. */}
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13.5px] text-muted">
              {s.members === 1 ? 'Solo tú en la mesa todavía' : s.members ? `${s.members} en la mesa` : 'En vuestra mesa'} · {ago(s.lastSync)}
            </p>
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                run('sync', syncNow);
              }}
              disabled={!!busy || s.status === 'syncing'}
              aria-label="Sincronizar ahora"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-sand px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {spinner('sync') || <RefreshCw size={14} {...ICON} />} Sincronizar
            </button>
          </div>

          {/* Lo que se usa una vez (código, cuenta, salir), plegado. */}
          <details className="group mt-3 rounded-2xl border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
              Código de la mesa y cuenta
              <ChevronDown size={16} {...ICON} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-line px-3.5 pt-3 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-muted">Código para unirse</p>
                  <p className="font-mono text-[22px] leading-tight font-bold tracking-[0.25em]">{s.mesa.codigo}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await shareText(`Únete a nuestra mesa en La Cuenta. con el código ${s.mesa!.codigo}`, 'La Cuenta.');
                    if (r === 'copied') showToast('Código copiado');
                  }}
                  aria-label="Compartir el código"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sand"
                >
                  <Copy size={16} {...ICON} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">Conectado como {s.email}</p>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-terracotta"
                >
                  <LogOut size={14} {...ICON} /> Salir
                </button>
              </div>
            </div>
          </details>
        </div>
      )}

      {s.error && (
        <p role="alert" className="mt-3 rounded-xl bg-terracotta/10 px-3 py-2 text-[13px] text-terracotta-dark">
          {s.error}
        </p>
      )}
    </Card>
  );
}
