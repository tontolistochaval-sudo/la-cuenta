import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Crown, Heart, Plus, Search, X } from 'lucide-react';
import { useStore, type SortKey } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { daysSince, fmtScore, lastVisit, norm, ofKind, rankVisited, stampDate } from '../lib/utils';
import { syncPct } from '../lib/stats';
import { Chip, ICON, Kicker, Photo, ScorePill } from '../components/ui';

interface Props {
  onOpen: (id: string) => void;
  onAdd: () => void;
  onStats: () => void;
}

export default function Ranking({ onOpen, onAdd, onStats }: Props) {
  const restaurants = useStore((s) => s.restaurants);
  const mode = useStore((s) => s.mode);
  const mine = useMemo(() => ofKind(restaurants, mode), [restaurants, mode]);
  const ranked = useMemo(() => rankVisited(mine), [mine]);
  const [query, setQuery] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const sort = useStore((s) => s.settings.sort);
  const setSettings = useStore((s) => s.setSettings);
  const home = mode === 'recipe';

  if (ranked.length === 0) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-center">
        <div>
          <p className="font-serif text-[34px] leading-tight">
            {home ? 'Aún no hay platos votados.' : 'Aún no hay cuentas saldadas.'}
          </p>
          <p className="mt-2 text-muted">La primera siempre es la más difícil de puntuar.</p>
          <button type="button" onClick={onAdd} className="mt-5 rounded-full bg-terracotta px-5 py-3 font-semibold text-white">
            {home ? 'Votar el primer plato' : 'Pasar la primera cuenta'}
          </button>
        </div>
      </div>
    );
  }

  const searching = query !== null;
  const q = norm(query ?? '');
  // La tabla es la clasificación completa: se lee deslizando la pantalla entera.
  // El número de puesto es siempre el del ranking por nota, aunque se ordene de otra forma.
  const SORTERS: Record<SortKey, (a: RestaurantEntry, b: RestaurantEntry) => number> = {
    score: () => 0,
    recent: (a, b) => (lastVisit(b) ?? '').localeCompare(lastVisit(a) ?? ''),
    gonzalo: (a, b) => b.scores!.gonzalo - a.scores!.gonzalo,
    vero: (a, b) => b.scores!.vero - a.scores!.vero,
  };
  const rows = ranked
    .map((r, k) => ({ r, pos: k + 1 }))
    .filter(({ r }) => (!favOnly || r.favorite) && (!tag || r.tags?.includes(tag)))
    .filter(
      ({ r }) =>
        !searching || !q || norm(`${r.name} ${r.category} ${r.neighborhood ?? ''} ${r.address ?? ''} ${r.bestDish ?? ''} ${(r.tags ?? []).join(' ')}`).includes(q)
    )
    .sort((a, b) => SORTERS[sort](a.r, b.r) || a.pos - b.pos);
  const favCount = ranked.filter((r) => r.favorite).length;
  const usedTags = [...new Set(ranked.flatMap((r) => r.tags ?? []))];

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {!searching && (
          <motion.div
            key="top"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            <ReceiptStrip ranked={ranked} home={home} onClick={onStats} />
            <Podium top={ranked.slice(0, 3)} onOpen={onOpen} onAdd={onAdd} />
          </motion.div>
        )}
      </AnimatePresence>

      <section aria-label="La tabla">
        {/* Cabecera pegajosa: el buscador sigue a mano al bajar. */}
        <div className="sticky top-0 z-10 -mx-4 flex h-12 items-center justify-between gap-2 bg-paper/90 px-4 backdrop-blur-md">
          {searching ? (
            <div className="relative flex-1">
              <Search size={15} {...ICON} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar sitio, plato, barrio…"
                aria-label="Buscar en el ranking"
                className="h-9 w-full rounded-full border border-line bg-cream pr-3 pl-9 text-[16px] outline-none focus:border-terracotta/50"
              />
            </div>
          ) : (
            <Kicker>La tabla · {ranked.length}</Kicker>
          )}
          <button
            type="button"
            onClick={() => setQuery(searching ? null : '')}
            aria-label={searching ? 'Cerrar búsqueda' : 'Buscar'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand text-ink"
          >
            {searching ? <X size={16} {...ICON} /> : <Search size={16} {...ICON} />}
          </button>
        </div>

        <div className="no-scrollbar -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4" role="toolbar" aria-label="Ordenar la tabla">
          {(
            [
              ['score', 'Nota'],
              ['recent', 'Recientes'],
              ['gonzalo', 'Gonzalo'],
              ['vero', 'Vero'],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} active={sort === k} onClick={() => setSettings({ sort: k })}>
              {label}
            </Chip>
          ))}
          {favCount > 0 && (
            <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
              <span className="inline-flex items-center gap-1">
                <Heart size={13} {...ICON} className={favOnly ? 'fill-current' : ''} /> {favCount}
              </span>
            </Chip>
          )}
          {usedTags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </Chip>
          ))}
        </div>

        {rows.length > 0 ? (
          <ol className="mt-1 space-y-2">
            {rows.map(({ r, pos }, k) => (
              <Row key={r.id} r={r} pos={pos} onOpen={onOpen} delay={Math.min(k, 8) * 0.03} />
            ))}
          </ol>
        ) : (
          <p className="mt-6 text-center font-serif text-[22px] text-muted">
            {searching && q ? `Nada con «${query}».` : 'Nada por aquí.'}
          </p>
        )}
        {!searching && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 text-[14px] text-muted"
          >
            <Plus size={16} {...ICON} /> {home ? 'Votar otro plato' : 'Pasar otra cuenta'}
          </button>
        )}
      </section>
    </div>
  );
}

/* ─────────── Tira de ticket con los datos ─────────── */

function ReceiptStrip({ ranked, home, onClick }: { ranked: RestaurantEntry[]; home: boolean; onClick: () => void }) {
  const lastDate = ranked.map((r) => lastVisit(r)).filter(Boolean).sort().pop();
  const days = lastDate ? daysSince(lastDate) : null;
  const late = days != null && days > 14;
  const items = [
    `${ranked.length} ${home ? 'PLATOS' : 'CUENTAS'}`,
    `SINTONÍA ${syncPct(ranked)}%`,
    days == null ? null : days === 0 ? 'HOY' : `HACE ${days} ${days === 1 ? 'DÍA' : 'DÍAS'}`,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-cream/70 px-3 py-2 text-left font-mono text-[11px] tracking-[0.08em] text-muted"
      aria-label="Ver el resumen"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
        {items.map((t, k) => (
          <span key={k} className={`flex items-center gap-2 ${k === 2 && late ? 'font-bold text-terracotta' : ''}`}>
            {k > 0 && <span className="text-stone-300">·</span>}
            {t}
          </span>
        ))}
      </span>
      <ChevronRight size={14} {...ICON} className="shrink-0" />
    </button>
  );
}

/* ─────────── Podio ─────────── */

const STEP = {
  1: 'h-[clamp(80px,13dvh,128px)] bg-ink text-paper',
  2: 'h-[clamp(66px,9.5dvh,94px)] bg-cream border border-line text-ink',
  3: 'h-[clamp(58px,7.5dvh,70px)] bg-sand text-ink',
} as const;

function Podium({ top, onOpen, onAdd }: { top: RestaurantEntry[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const order: (1 | 2 | 3)[] = [2, 1, 3];
  return (
    <section aria-label="Podio" className="grid grid-cols-3 items-end gap-2">
      {order.map((pos, k) => {
        const r = top[pos - 1];
        const first = pos === 1;
        if (!r) {
          return (
            <button
              key={pos}
              type="button"
              onClick={onAdd}
              className={`flex flex-col items-center justify-center rounded-t-2xl border border-dashed border-stone-300 text-[11px] text-muted ${STEP[pos].split(' ')[0]}`}
            >
              <Plus size={16} {...ICON} />#{pos} libre
            </button>
          );
        }
        return (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.id)}
            whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: [0.1, 0, 0.2][k], type: 'spring', damping: 20, stiffness: 220 }}
            className="flex min-w-0 flex-col items-center"
            aria-label={`Puesto ${pos}: ${r.name}, ${fmtScore(r.scores!.average)}`}
          >
            {first && <Crown size={20} {...ICON} className="mb-0.5 text-gold" />}
            <div className={`relative rounded-full p-[3px] ${first ? 'bg-gold' : 'bg-line'}`}>
              <Photo
                src={r.imageUrl}
                alt=""
                category={r.category}
                className={`rounded-full ${first ? 'h-[clamp(64px,10dvh,84px)] w-[clamp(64px,10dvh,84px)]' : 'h-[clamp(50px,7.5dvh,64px)] w-[clamp(50px,7.5dvh,64px)]'}`}
                emojiSize={first ? 'text-3xl' : 'text-2xl'}
              />
            </div>
            <p className={`mt-1.5 line-clamp-2 min-h-[2.3em] px-0.5 text-center leading-[1.15] font-semibold ${first ? 'text-[13.5px]' : 'text-[12px]'}`}>
              {r.name}
            </p>
            <div className={`mt-1 flex w-full flex-col items-center justify-start rounded-t-2xl pt-2 ${STEP[pos]}`}>
              <span className={`font-serif leading-none tabular-nums ${first ? 'text-[40px]' : 'text-[28px]'}`}>
                {fmtScore(r.scores!.average)}
              </span>
              <span className={`mt-1 font-mono text-[9.5px] ${first ? 'text-paper/60' : 'text-muted'}`}>
                {first ? `G ${fmtScore(r.scores!.gonzalo)} · V ${fmtScore(r.scores!.vero)}` : `#${pos}`}
              </span>
            </div>
          </motion.button>
        );
      })}
    </section>
  );
}

/* ─────────── Filas ─────────── */

function Row({ r, pos, onOpen, delay }: { r: RestaurantEntry; pos: number; onOpen: (id: string) => void; delay: number }) {
  const date = stampDate(lastVisit(r));
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-cream p-2 pr-3.5 text-left shadow-warm transition-transform active:scale-[0.99]"
      >
        <span className={`w-6 shrink-0 text-center font-mono text-[12px] font-bold ${pos <= 3 ? 'text-gold' : 'text-muted'}`}>
          {String(pos).padStart(2, '0')}
        </span>
        <Photo src={r.imageUrl} alt="" category={r.category} className="h-14 w-14 shrink-0 rounded-xl" emojiSize="text-2xl" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[15px] leading-tight font-semibold">
            <span className="truncate">{r.name}</span>
            {r.favorite && <Heart size={13} {...ICON} className="shrink-0 fill-terracotta text-terracotta" aria-label="Favorito" />}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted">{[r.category, r.neighborhood].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex gap-1">
            <ScorePill who="G" value={r.scores!.gonzalo} />
            <ScorePill who="V" value={r.scores!.vero} />
          </div>
        </div>
        <span className="flex shrink-0 flex-col items-end border-l border-dashed border-stone-300 pl-3">
          <span className="font-serif text-[30px] leading-none tabular-nums">{fmtScore(r.scores!.average)}</span>
          {date && <span className="mt-1 font-mono text-[10px] text-muted">{date.short}</span>}
        </span>
      </button>
    </motion.li>
  );
}
