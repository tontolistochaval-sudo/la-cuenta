import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookmarkPlus, Check, ExternalLink, LoaderCircle, MapPin, Sparkles } from 'lucide-react';
import Sheet from './Sheet';
import { ICON, Kicker, Segmented } from './ui';
import { useStore } from '../store/useStore';
import { aiDiscover, aiUnavailable, type AIPlace, type DiscoverFocus } from '../lib/ai';
import { reverse, searchPlaces } from '../lib/geo';
import { haptic } from '../lib/native';
import { emojiFor, norm, uid } from '../lib/utils';
import type { RestaurantEntry } from '../data/seedData';

const LOADING = ['Mirando vuestras mejores notas…', 'Buscando por Madrid…', 'Comparando barrios…', 'Descartando lo que ya conocéis…'];

/** Busca el sitio recomendado en el mapa para guardarlo con ubicación y barrio reales. */
async function locate(p: AIPlace) {
  const tries = [p.address ? `${p.name}, ${p.address}` : '', p.name].filter(Boolean);
  for (const q of tries) {
    try {
      const { places } = await searchPlaces(q, { quick: true });
      const n = norm(p.name);
      const match = places.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name))) ?? (p.address ? places[0] : undefined);
      if (match) {
        const hood = match.neighborhood ?? (await reverse(match.coordinates)).neighborhood;
        return { ...match, neighborhood: hood };
      }
    } catch {
      /* siguiente intento */
    }
  }
  return undefined;
}

export default function DiscoverSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const restaurants = useStore((s) => s.restaurants);
  const upsert = useStore((s) => s.upsert);
  const [focus, setFocus] = useState<DiscoverFocus>('parecido');
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [places, setPlaces] = useState<AIPlace[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  // Ubicaciones ya encontradas (al comprobar sugerencias sin búsqueda de Google), para no repetir la búsqueda al guardar.
  const [found, setFound] = useState<Record<string, Awaited<ReturnType<typeof locate>>>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const known = (name: string) => restaurants.find((r) => r.kind === 'restaurant' && norm(r.name) === norm(name));

  const ask = async () => {
    const why = aiUnavailable();
    if (why) return setError(why);
    setBusy(true);
    setError('');
    setNote('');
    setPlaces(null);
    const timer = window.setInterval(() => setTick((t) => t + 1), 1600);
    try {
      const res = await aiDiscover(restaurants, focus, wish.trim());
      let list = res.places;
      if (res.grounded === false && list.length) {
        // Sin búsqueda de Google (respaldo de Groq): enseñar solo lo que existe de verdad en el mapa.
        clearInterval(timer);
        const ok: AIPlace[] = [];
        const where: typeof found = {};
        for (let k = 0; k < list.length; k++) {
          setChecking(`Comprobando en el mapa ${k + 1}/${list.length}…`);
          const w = await locate(list[k]);
          if (w) {
            ok.push(list[k]);
            where[list[k].name] = w;
          }
        }
        setChecking(null);
        setFound((f) => ({ ...f, ...where }));
        const dropped = list.length - ok.length;
        list = ok;
        setNote(
          `Hoy Gemini no tiene cuota: sugerencias del respaldo (Groq), comprobadas en el mapa.${
            dropped ? ` He descartado ${dropped} que no aparecían.` : ''
          }`
        );
      } else if (res.provider === 'groq-web') {
        setNote('Hoy Gemini no tiene cuota: sugerencias del respaldo (Groq con búsqueda web).');
      }
      setPlaces(list);
      if (!list.length) setError('No han salido sugerencias que existan en el mapa. Prueba otra vez o con otro enfoque.');
      else haptic.success();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setChecking(null);
      setBusy(false);
    }
  };

  const save = async (p: AIPlace) => {
    setSaving(p.name);
    try {
      const where = found[p.name] ?? (await locate(p));
      const lvl = p.priceLevel && p.priceLevel >= 1 && p.priceLevel <= 4 ? (Math.round(p.priceLevel) as 1 | 2 | 3 | 4) : undefined;
      const entry: RestaurantEntry = {
        id: uid(),
        kind: 'restaurant',
        name: p.name,
        category: p.category || 'Otros',
        status: 'wishlist',
        neighborhood: where?.neighborhood ?? p.neighborhood,
        address: where?.address ?? p.address,
        coordinates: where?.coordinates,
        phone: where?.phone,
        website: where?.website,
        priceLevel: lvl,
        bestDish: p.dish || undefined,
        notes: p.why || undefined,
        tags: ['Sugerencia IA'],
      };
      upsert(entry);
      haptic.success();
      setSaved((s) => ({ ...s, [p.name]: entry.id }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Descubrir sitios" tone="paper">
      <div className="space-y-4 pb-2">
        <div>
          <Kicker>Con IA · Gemini</Kicker>
          <h2 className="font-serif text-[34px] leading-none">
            Descubrir sitios<span className="text-terracotta">.</span>
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">Sitios reales de Madrid donde no habéis ido, elegidos según vuestras notas.</p>
        </div>

        <Segmented
          label="Enfoque"
          size="sm"
          value={focus}
          onChange={setFocus}
          options={[
            { value: 'parecido', label: 'Como los mejores' },
            { value: 'zonas', label: 'Vuestras zonas' },
            { value: 'nuevo', label: 'Algo nuevo' },
          ]}
        />
        <input
          className="w-full rounded-xl border border-transparent bg-sand px-3.5 py-3 text-[16px] outline-none placeholder:text-muted/70 focus:border-terracotta/50 focus:bg-cream"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="¿Algo concreto? Japonés barato, terraza, brunch…"
          aria-label="Qué os apetece"
          enterKeyHint="search"
          onKeyDown={(e) => e.key === 'Enter' && !busy && ask()}
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} {...ICON} />}
          {busy ? (checking ?? LOADING[tick % LOADING.length]) : places ? 'Otras sugerencias' : 'Recomiéndanos'}
        </button>

        {error && (
          <p role="alert" className="rounded-xl bg-terracotta/10 px-3 py-2 text-[13px] text-terracotta-dark">
            {error}
          </p>
        )}

        {places && places.length > 0 && (
          <ul className="space-y-2.5">
            {places.map((p, k) => {
              const already = known(p.name);
              const savedId = saved[p.name];
              return (
                <motion.li
                  key={`${p.name}-${k}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: k * 0.06 }}
                  className="rounded-2xl border border-line bg-cream p-3.5 shadow-warm"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand text-[22px]">{emojiFor(p.category ?? '')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[22px] leading-tight">{p.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
                        {[p.category, p.neighborhood].filter(Boolean).join(' · ')}
                        {p.priceLevel ? <span className="font-mono font-bold">{'€'.repeat(Math.min(4, Math.max(1, Math.round(p.priceLevel))))}</span> : null}
                      </p>
                    </div>
                  </div>
                  {p.basedOn && p.basedOn !== 'null' && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-semibold text-gold">
                      Porque os encantó {p.basedOn}
                    </p>
                  )}
                  {p.why && <p className="mt-2 text-[13.5px] leading-snug">{p.why}</p>}
                  {p.dish && (
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      <span className="font-mono text-[10px] tracking-[0.15em]">PEDIR · </span>
                      {p.dish}
                    </p>
                  )}
                  {p.address && (
                    <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
                      <MapPin size={12} {...ICON} /> {p.address}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {already || savedId ? (
                      <button
                        type="button"
                        onClick={() => onOpen((already ?? restaurants.find((r) => r.id === savedId))!.id)}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-sage/15 py-2.5 text-[13px] font-semibold text-sage"
                      >
                        <Check size={15} {...ICON} /> {savedId ? 'Guardado' : 'Ya lo tenéis'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => save(p)}
                        disabled={saving === p.name}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-paper disabled:opacity-60"
                      >
                        {saving === p.name ? <LoaderCircle size={15} className="animate-spin" /> : <BookmarkPlus size={15} {...ICON} />}
                        {saving === p.name ? 'Ubicando…' : 'A pendientes'}
                      </button>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address, 'Madrid'].filter(Boolean).join(', '))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-full bg-sand py-2.5 text-[13px] font-semibold"
                    >
                      <ExternalLink size={15} {...ICON} /> Ver en Maps
                    </a>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}

        {places && places.length > 0 && (
          <p className="text-center text-[11px] text-muted">
            {note || 'Sugerencias de Gemini con búsqueda de Google.'} Comprobad horario y reseñas antes de ir.
          </p>
        )}
      </div>
    </Sheet>
  );
}

