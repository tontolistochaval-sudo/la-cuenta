import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Plus, ReceiptText, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fmtEuro, ofKind } from '../lib/utils';
import { ICON, Kicker, Photo } from '../components/ui';

interface Props {
  onOpen: (id: string) => void;
  onEvaluate: (id: string) => void;
  onAddWish: () => void;
  onDiscover: () => void;
}

export default function Wishlist({ onOpen, onEvaluate, onAddWish, onDiscover }: Props) {
  const restaurants = useStore((s) => s.restaurants);
  const mode = useStore((s) => s.mode);
  const home = mode === 'recipe';
  const wish = useMemo(() => ofKind(restaurants, mode).filter((r) => r.status === 'wishlist'), [restaurants, mode]);

  return (
    <div>
      <div className="flex items-end justify-between pb-3">
        <div>
          <Kicker>{`${wish.length} ${wish.length === 1 ? 'guardado' : 'guardados'}`}</Kicker>
          <h2 className="font-serif text-[30px] leading-none">{home ? 'Por cocinar' : 'Pendientes'}</h2>
        </div>
        <div className="flex gap-1.5">
          {(
            <button
              type="button"
              onClick={onDiscover}
              className="flex items-center gap-1 rounded-full bg-terracotta px-3 py-2 text-[13px] font-semibold text-white"
            >
              <Sparkles size={15} {...ICON} /> Descubrir
            </button>
          )}
          <button
            type="button"
            onClick={onAddWish}
            className="flex items-center gap-1 rounded-full bg-sand px-3 py-2 text-[13px] font-semibold"
          >
            <Plus size={15} {...ICON} /> Guardar
          </button>
        </div>
      </div>

      {wish.length === 0 ? (
        <div className="grid min-h-[50dvh] place-items-center text-center">
          <div>
            <Bookmark size={28} {...ICON} className="mx-auto text-sage" />
            <p className="mt-3 font-serif text-[26px] leading-tight">
              {home ? 'Ninguna receta en la lista.' : 'La lista de deseos está vacía.'}
            </p>
            <p className="mt-1 text-[14px] text-muted">
              {home ? 'Guarda esa receta que visteis en TikTok.' : 'Guarda ese sitio que visteis en Instagram.'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {wish.map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-stretch gap-3 rounded-2xl border border-line bg-cream p-2 shadow-warm"
            >
              <button type="button" onClick={() => onOpen(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Photo src={r.imageUrl} alt="" category={r.category} className="h-[72px] w-[72px] shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate font-serif text-[22px] leading-none">{r.name}</p>
                  <p className="mt-1 truncate text-[12px] text-muted">
                    {[r.address ?? r.neighborhood, r.category].filter(Boolean).join(' · ')}
                  </p>
                  {r.pricePerPerson != null && (
                    <p className="mt-1 font-mono text-[11px] text-muted">~{fmtEuro(r.pricePerPerson)}/p</p>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onEvaluate(r.id)}
                aria-label={`${home ? 'Votar' : 'Pasar la cuenta de'} ${r.name}`}
                className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-terracotta text-[10.5px] font-semibold text-white"
              >
                <ReceiptText size={18} {...ICON} />
                {home ? 'Votar' : 'Ya fuimos'}
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
