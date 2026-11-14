import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Sheet from './Sheet';
import { Kicker } from './ui';
import { useStore } from '../store/useStore';
import { achievements, diary, summary } from '../lib/stats';
import { emojiFor, fmtEuro, fmtScore, ofKind, stampDate } from '../lib/utils';

export default function StatsSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const restaurants = useStore((s) => s.restaurants);
  const mode = useStore((s) => s.mode);
  const home = mode === 'recipe';
  const s = useMemo(() => summary(ofKind(restaurants, mode)), [restaurants, mode]);
  const badges = useMemo(() => achievements(ofKind(restaurants, mode), mode === 'recipe'), [restaurants, mode]);
  const log = useMemo(() => diary(ofKind(restaurants, mode)), [restaurants, mode]);
  const maxMonth = Math.max(1, ...s.months.map((m) => m.count));
  const tougher = Math.abs(s.g - s.v) < 0.05 ? null : s.g < s.v ? 'Gonzalo' : 'Vero';

  const tile = 'rounded-2xl border border-line bg-cream p-3.5';

  return (
    <Sheet open={open} onClose={onClose} title="Resumen" tone="paper">
      <div className="space-y-3 pb-2">
        <div>
          <Kicker>{home ? 'En casa' : 'Fuera'}</Kicker>
          <h2 className="font-serif text-[34px] leading-none">
            El resumen<span className="text-terracotta">.</span>
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-ink p-3.5 text-paper">
            <Kicker className="text-paper/55!">{home ? 'Platos' : 'Cuentas'}</Kicker>
            <p className="font-serif text-[40px] leading-none">{s.n}</p>
          </div>
          <div className={tile}>
            <Kicker>Media</Kicker>
            <p className="font-serif text-[40px] leading-none">{fmtScore(s.avg)}</p>
          </div>
          {s.repeatKnown > 0 ? (
            <div className={tile}>
              <Kicker>Repetiríamos</Kicker>
              <p className="font-serif text-[40px] leading-none">
                {s.repeat}
                <span className="text-[18px] text-muted">/{s.repeatKnown}</span>
              </p>
              {/* Solo cuentan los que habéis marcado "Repetimos" o "Una y no más". */}
              <p className="mt-0.5 text-[10.5px] leading-tight text-muted">de los {s.repeatKnown} que habéis marcado</p>
            </div>
          ) : (
            <div className={tile}>
              <Kicker>Récord</Kicker>
              <p className="font-serif text-[40px] leading-none text-terracotta">{fmtScore(s.best)}</p>
            </div>
          )}
        </div>

        <div className={tile}>
          <div className="flex items-baseline justify-between">
            <Kicker>Quién es más duro</Kicker>
            <span className="text-[12px] text-muted">Sintonía {s.sync}%</span>
          </div>
          <div className="mt-2.5 space-y-2">
            {(
              [
                ['Gonzalo', s.g, '#E05A47'],
                ['Vero', s.v, '#4A6B53'],
              ] as const
            ).map(([name, val, color]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-16 text-[13px] font-medium">{name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand">
                  {/* La escala empieza en 5 para que se note la diferencia. */}
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, (val - 5) * 20)}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[13px]">{fmtScore(val)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">
            {tougher ? `${tougher} pone de media ${fmtScore(Math.abs(s.g - s.v))} puntos menos.` : 'Exactamente igual de exigentes.'}
          </p>
        </div>

        {(s.debate || s.unanimous.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {s.debate && (
              <button type="button" onClick={() => onOpen(s.debate!.id)} className={`${tile} text-left`}>
                <Kicker>La gran discusión</Kicker>
                <p className="mt-1 truncate text-[14px] font-semibold">{s.debate.name}</p>
                <p className="font-mono text-[12px] text-muted">
                  G {fmtScore(s.debate.scores!.gonzalo)} · V {fmtScore(s.debate.scores!.vero)}
                </p>
              </button>
            )}
            {s.unanimous.length > 0 && (
              <button type="button" onClick={() => onOpen(s.unanimous[0].id)} className={`${tile} text-left`}>
                <Kicker>Unanimidad</Kicker>
                <p className="mt-1 truncate text-[14px] font-semibold">{s.unanimous.map((u) => u.name).join(', ')}</p>
                <p className="font-mono text-[12px] text-muted">misma nota exacta</p>
              </button>
            )}
          </div>
        )}

        {s.types.length > 0 && (
          <div className={tile}>
            <Kicker>Lo que mejor se nos da</Kicker>
            <ul className="mt-2 space-y-1.5">
              {s.types.slice(0, 4).map((t) => (
                <li key={t.name} className="flex items-center gap-2 text-[14px]">
                  <span>{emojiFor(t.name)}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="font-mono text-[11px] text-muted">×{t.count}</span>
                  <span className="w-11 text-right font-serif text-[20px] leading-none">{fmtScore(t.avg)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={tile}>
          <Kicker>Últimos 6 meses</Kicker>
          <div className="mt-3 flex h-20 items-end gap-2">
            {s.months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-muted">{m.count || ''}</span>
                <motion.div
                  className={`w-full rounded-md ${m.count ? 'bg-terracotta' : 'bg-sand'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, (m.count / maxMonth) * 52)}px` }}
                  transition={{ duration: 0.6 }}
                />
                <span className="font-mono text-[10px] text-muted uppercase">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={tile}>
          <div className="flex items-baseline justify-between">
            <Kicker>Logros</Kicker>
            <span className="font-mono text-[11px] text-muted">
              {badges.filter((b) => b.done).length}/{badges.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {badges.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl px-1.5 py-2.5 text-center ${b.done ? "bg-gold-soft" : "bg-sand/60 opacity-60 grayscale"}`}
                title={b.hint}
              >
                <div className="text-[22px] leading-none">{b.emoji}</div>
                <p className="mt-1 text-[11.5px] leading-tight font-semibold">{b.title}</p>
                <p className="text-[10px] leading-tight text-muted">{b.done ? "¡Hecho!" : b.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {log.length > 0 && (
          <div className={tile}>
            <Kicker>Vuestro diario</Kicker>
            <div className="mt-2 space-y-3">
              {log.map((g) => (
                <div key={g.label}>
                  <p className="mb-1 font-serif text-[18px] leading-none capitalize">{g.label}</p>
                  <ul>
                    {g.items.map((e, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => onOpen(e.entry.id)}
                          className="flex w-full items-center gap-2.5 border-b border-dashed border-line py-1.5 text-left last:border-0"
                        >
                          <span className="w-12 shrink-0 font-mono text-[11px] text-muted">{stampDate(e.date)?.short.slice(0, 5)}</span>
                          <span>{emojiFor(e.entry.category)}</span>
                          <span className="min-w-0 flex-1 truncate text-[14px]">
                            {e.entry.name}
                            {e.again && <span className="ml-1 text-[11px] text-sage">· repetimos</span>}
                          </span>
                          <span className="font-serif text-[18px] leading-none">{fmtScore(e.entry.scores!.average)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {!home && (s.hoods.length > 0 || s.avgTicket != null) && (
          <div className="grid grid-cols-2 gap-2">
            {s.hoods[0] && (
              <div className={tile}>
                <Kicker>Zona cero</Kicker>
                <p className="mt-1 font-serif text-[24px] leading-none">{s.hoods[0].name}</p>
                <p className="text-[12px] text-muted">
                  {s.hoods[0].count} {s.hoods[0].count === 1 ? 'visita' : 'visitas'}
                </p>
              </div>
            )}
            {s.avgTicket != null && (
              <div className={tile}>
                <Kicker>Ticket medio</Kicker>
                <p className="mt-1 font-mono text-[22px] leading-none">{fmtEuro(s.avgTicket)}</p>
                <p className="text-[12px] text-muted">
                  ~{fmtEuro(Math.round(s.spent))} en total ({s.pricedCount} con precio)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
