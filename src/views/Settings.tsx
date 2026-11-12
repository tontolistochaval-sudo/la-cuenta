import { useEffect, useRef, useState } from 'react';
import { Bell, Download, GitMerge, RotateCcw, Share, Smartphone, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { parseBackup, today } from '../lib/utils';
import { exportFile, haptic, isNative, setWeeklyReminder } from '../lib/native';
import { Card, ICON, Kicker } from '../components/ui';
import SyncCard from '../components/SyncCard';

type Msg = { kind: 'ok' | 'error'; text: string } | null;

/** Espacio ocupado (IndexedDB) y fotos propias. */
function StorageMeter() {
  const restaurants = useStore((s) => s.restaurants);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => {});
  }, [restaurants]);
  const photos = restaurants.filter((r) => r.imageUrl?.startsWith('data:')).length;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1);
  return (
    <p className="mt-2 font-mono text-[10.5px] text-muted">
      {usage ? `${mb(usage.used)} MB usados` : 'Guardado en el móvil'} · {photos} {photos === 1 ? 'foto propia' : 'fotos propias'}
    </p>
  );
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Solo en la web: cómo instalarla. En la app de Android no se muestra. */
function InstallCard() {
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  );
  const prompt = (window as unknown as { __installPrompt?: InstallPrompt }).__installPrompt;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isNative || installed) return null;
  return (
    <Card className="p-5">
      <Kicker>Tenerla como app</Kicker>
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3 text-[14px] font-semibold text-white"
        >
          <Smartphone size={16} {...ICON} /> Instalar La Cuenta.
        </button>
      ) : (
        <p className="mt-1 text-[14px] text-muted">
          {ios ? (
            <>
              En Safari: <b>Compartir</b> <Share size={13} className="inline" /> → <b>Añadir a pantalla de inicio</b>.
            </>
          ) : (
            <>
              Menú del navegador (⋮) → <b>Instalar aplicación</b>.
            </>
          )}
        </p>
      )}
    </Card>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-sage' : 'bg-sand'}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-cream shadow-warm transition-all ${on ? 'left-7' : 'left-1'}`} />
    </button>
  );
}

export default function Settings() {
  const restaurants = useStore((s) => s.restaurants);
  const replaceAll = useStore((s) => s.replaceAll);
  const mergeAll = useStore((s) => s.mergeAll);
  const reset = useStore((s) => s.reset);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<RestaurantEntry[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const out = restaurants.filter((r) => r.kind === 'restaurant' && r.status === 'visited').length;
  const cooked = restaurants.filter((r) => r.kind === 'recipe' && r.status === 'visited').length;
  const wish = restaurants.filter((r) => r.status === 'wishlist').length;

  const exportJson = async () => {
    const payload = { app: 'la-cuenta', version: 4, exportedAt: new Date().toISOString(), restaurants };
    try {
      await exportFile(`la-cuenta-${today()}.json`, JSON.stringify(payload));
      setMsg({ kind: 'ok', text: `Copia lista con ${restaurants.length} entradas.` });
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo crear la copia.' });
    }
  };

  const readFile = async (file: File) => {
    try {
      setPending(parseBackup(JSON.parse(await file.text())));
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? `No se pudo leer: ${e.message}` : 'Archivo no válido.' });
    }
  };

  const toggleReminder = async (on: boolean) => {
    const ok = await setWeeklyReminder(on);
    if (on && !ok) return setMsg({ kind: 'error', text: 'Sin permiso de notificaciones. Actívalo en los ajustes del móvil.' });
    setSettings({ reminder: on });
    haptic.tap();
  };

  return (
    <div className="space-y-4">
      <div>
        <Kicker>La trastienda</Kicker>
        <h2 className="font-serif text-[30px] leading-none">Ajustes</h2>
      </div>

      <Card className="p-5">
        <Kicker>El libro de cuentas</Kicker>
        <p className="mt-2 font-serif text-[24px] leading-tight">
          {out} {out === 1 ? 'cuenta saldada' : 'cuentas saldadas'}, {cooked} {cooked === 1 ? 'plato' : 'platos'} en casa
          {wish > 0 && ` y ${wish} pendientes`}.
        </p>
        <StorageMeter />
      </Card>

      <SyncCard />

      <Card className="p-5">
        <Kicker>Copias a mano</Kicker>
        <p className="mt-1 text-[13.5px] text-muted">
          Una copia de seguridad, o para pasar los datos sin la nube: uno <b>envía su copia</b> (por WhatsApp, por ejemplo) y el
          otro la <b>junta</b>. Se queda con lo más reciente de cada sitio, sin duplicar.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14px] font-semibold text-paper"
          >
            <Download size={16} {...ICON} /> Enviar copia
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-full bg-sand py-3 text-[14px] font-semibold"
          >
            <Upload size={16} {...ICON} /> Abrir copia
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {pending && (
          <div className="mt-3 rounded-2xl bg-sand/60 p-3">
            <p className="text-[13.5px]">
              La copia trae <b>{pending.length}</b> entradas. ¿Qué hago?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const { added, updated } = mergeAll(pending);
                  setPending(null);
                  haptic.success();
                  setMsg({ kind: 'ok', text: `Juntado: ${added} nuevas y ${updated} actualizadas.` });
                }}
                className="flex items-center justify-center gap-1.5 rounded-full bg-sage py-2.5 text-[13.5px] font-semibold text-white"
              >
                <GitMerge size={15} {...ICON} /> Juntar
              </button>
              <button
                type="button"
                onClick={() => {
                  replaceAll(pending);
                  setMsg({ kind: 'ok', text: `Reemplazado por la copia (${pending.length} entradas).` });
                  setPending(null);
                }}
                className="rounded-full border border-line bg-cream py-2.5 text-[13.5px] font-semibold text-terracotta"
              >
                Reemplazar todo
              </button>
            </div>
            <button type="button" onClick={() => setPending(null)} className="mt-2 w-full text-center text-[12.5px] text-muted">
              Cancelar
            </button>
          </div>
        )}

        {msg && (
          <p
            role="status"
            className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${msg.kind === 'ok' ? 'bg-sage/10 text-sage' : 'bg-terracotta/10 text-terracotta-dark'}`}
          >
            {msg.text}
          </p>
        )}
      </Card>

      {isNative && (
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-terracotta/10 text-terracotta">
            <Bell size={18} {...ICON} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Recordatorio de los viernes</p>
            <p className="text-[12.5px] text-muted">A las 19:00: «¿Dónde cenamos hoy?»</p>
          </div>
          <Toggle on={settings.reminder} onChange={toggleReminder} label="Recordatorio de los viernes" />
        </Card>
      )}

      <InstallCard />

      <Card className="p-5">
        <Kicker>Empezar de cero</Kicker>
        <p className="mt-1 text-[14px] text-muted">Vuelve a dejar solo lo del Excel. Se pierde todo lo añadido.</p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirmReset(false)} className="flex-1 rounded-full bg-sand py-3 text-[14px]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setConfirmReset(false);
                haptic.warning();
                setMsg({ kind: 'ok', text: 'Vuelta a los datos del Excel.' });
              }}
              className="flex-1 rounded-full bg-terracotta py-3 text-[14px] font-semibold text-white"
            >
              Sí, borrar lo añadido
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="mt-3 flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-semibold text-terracotta"
          >
            <RotateCcw size={15} {...ICON} /> Volver al Excel
          </button>
        )}
      </Card>

      <div className="space-y-1 pt-2 text-center">
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted">LA CUENTA. · G & V · MADRID · MMXXVI</p>
        <p className="text-[11px] text-muted">
          Versión {__APP_VERSION__} · Mapas © OpenStreetMap y CARTO · Búsqueda: Nominatim y Photon
        </p>
      </div>
    </div>
  );
}
