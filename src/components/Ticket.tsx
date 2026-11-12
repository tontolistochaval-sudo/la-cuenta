import type { ReactNode } from 'react';
import type { RestaurantEntry } from '../data/seedData';
import { fmtEuro, fmtScore, stampDate, verdict } from '../lib/utils';
import { Dots } from './ui';

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${strong ? 'text-ink' : ''}`}>
      <span className="shrink-0">{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-stone-300" aria-hidden />
      <span className="shrink-0 text-right tabular-nums">{children}</span>
    </div>
  );
}

const Rule = ({ double }: { double?: boolean }) => (
  <div className={`my-4 border-dashed border-stone-300 ${double ? 'h-1 border-y' : 'border-t'}`} aria-hidden />
);

function Barcode({ seed }: { seed: string }) {
  let h = hash(seed);
  const bars = Array.from({ length: 44 }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 1 + (h % 3);
  });
  return (
    <div className="flex h-10 items-stretch justify-center gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className={i % 2 ? 'bg-transparent' : 'bg-ink'} style={{ width: w }} />
      ))}
    </div>
  );
}

/** "El Ticket": el desglose con estética de recibo de autor. */
export default function Ticket({ r }: { r: RestaurantEntry }) {
  const s = r.scores;
  if (!s) return null;
  const home = r.kind === 'recipe';
  const date = stampDate(r.visitDate);
  const ticketNo = String(hash(r.id) % 100000).padStart(5, '0');
  const hasDetail = s.food != null || s.vibe != null || s.value != null;

  return (
    <div className="[filter:drop-shadow(0_1px_1px_rgb(120_100_70/0.08))_drop-shadow(0_14px_22px_rgb(120_90_60/0.14))]">
      <article
        className="ticket-edge relative bg-cream px-6 pt-9 pb-8 font-mono text-[12.5px] leading-relaxed text-muted"
        aria-label={`Ticket de ${r.name}`}
      >
        {date && (
          <div
            className="absolute top-7 right-4 rotate-[-9deg] rounded-md border-2 border-terracotta/80 px-2 py-1 text-center text-terracotta/85 mix-blend-multiply"
            aria-label={`Fecha ${date.day} ${date.month} ${date.year}`}
          >
            <div className="text-[8px] font-bold tracking-[0.25em]">{home ? 'COCINADO' : 'SALDADA'}</div>
            <div className="text-[17px] leading-none font-bold">
              {date.day} {date.month}
            </div>
            <div className="text-[9px] tracking-[0.3em]">{date.year}</div>
          </div>
        )}

        <header className="pr-20">
          <p className="font-serif text-[30px] leading-none text-ink">
            La Cuenta<span className="text-terracotta">.</span>
          </p>
          <p className="mt-1 text-[9.5px] tracking-[0.2em] uppercase">
            {home ? 'Cocina de casa · Mesa del salón' : 'Club gastronómico privado · Madrid'}
          </p>
          <p className="mt-2 text-[10.5px]">
            TICKET Nº {ticketNo} · 2 PAX{date && <> · {date.short}</>}
          </p>
        </header>

        <Rule />

        <p className="text-[14px] font-bold tracking-wide text-ink uppercase">{r.name}</p>
        <p className="text-[11px] uppercase">
          {[r.neighborhood, r.category].filter(Boolean).join(' · ')}
        </p>
        {r.address && <p className="text-[11px]">{r.address}, Madrid</p>}

        {hasDetail && (
          <>
            <Rule />
            <p className="mb-1.5 text-[10px] tracking-[0.2em]">— DESGLOSE —</p>
            <div className="space-y-1">
              {s.food != null && (
                <Row label="COMIDA">
                  <Dots value={s.food} />
                </Row>
              )}
              {s.vibe != null && (
                <Row label="AMBIENTE">
                  <Dots value={s.vibe} />
                </Row>
              )}
              {s.value != null && (
                <Row label="CALIDAD/PRECIO">
                  <Dots value={s.value} />
                </Row>
              )}
            </div>
          </>
        )}

        <Rule />

        <p className="mb-1.5 text-[10px] tracking-[0.2em]">— VEREDICTOS —</p>
        <div className="space-y-1">
          <Row label="NOTA GONZALO" strong>
            {fmtScore(s.gonzalo)}
          </Row>
          <Row label="NOTA VERO" strong>
            {fmtScore(s.vero)}
          </Row>
          <Row label="DIFERENCIA">±{fmtScore(Math.abs(s.gonzalo - s.vero))}</Row>
        </div>

        {(r.pricePerPerson != null || r.wouldRepeat != null || r.priceLevel || (r.revisits?.length ?? 0) > 0) && <Rule />}
        <div className="space-y-1">
          {r.pricePerPerson != null && (
            <>
              <Row label="PRECIO / PERSONA" strong>
                {fmtEuro(r.pricePerPerson)}
              </Row>
              <Row label="TOTAL MESA (×2)">{fmtEuro(r.pricePerPerson * 2)}</Row>
            </>
          )}
          {r.pricePerPerson == null && r.priceLevel && <Row label="PRECIO">{'€'.repeat(r.priceLevel)}</Row>}
          {(r.revisits?.length ?? 0) > 0 && (
            <Row label={home ? 'VECES HECHA' : 'VISITAS'} strong>
              ×{(r.revisits?.length ?? 0) + 1}
            </Row>
          )}
          {r.wouldRepeat != null && (
            <Row label={home ? '¿OTRA VEZ?' : '¿REPETIRÍAMOS?'}>
              <span className={r.wouldRepeat ? 'font-bold text-sage' : 'font-bold text-terracotta'}>
                {r.wouldRepeat ? 'SÍ ✓' : 'NO ✕'}
              </span>
            </Row>
          )}
        </div>

        {r.bestDish && (
          <div className="mt-3 rounded-lg bg-sand px-3 py-2">
            <p className="text-[9.5px] tracking-[0.2em]">★ {home ? 'EL TRUCO' : 'PLATO ESTRELLA'}</p>
            <p className="text-ink">{r.bestDish}</p>
          </div>
        )}

        {r.notes && <p className="mt-3 text-[12px] text-ink/80 italic">“{r.notes}”</p>}

        <Rule double />

        <div className="text-center">
          <p className="text-[10px] tracking-[0.3em]">MEDIA FINAL</p>
          <p className="font-serif text-[88px] leading-[0.95] text-terracotta tabular-nums">{fmtScore(s.average)}</p>
          <p className="mt-1 inline-block rounded-full bg-ink px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-paper uppercase">
            {verdict(s.average)}
          </p>
        </div>

        <Rule />

        <Barcode seed={r.id} />
        <p className="mt-2 text-center text-[9.5px] tracking-[0.25em]">
          {home ? 'HECHO CON AMOR EN CASA' : 'GRACIAS POR SU VISITA'}
        </p>
        <p className="text-center text-[9px] tracking-[0.2em] text-stone-400">IVA Y CARIÑO INCLUIDOS</p>
      </article>
    </div>
  );
}
