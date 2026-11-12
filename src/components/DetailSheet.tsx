import {
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  Globe,
  Heart,
  MapPin,
  MapPinPlus,
  Navigation,
  Pencil,
  Phone,
  ReceiptText,
  Repeat,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import Sheet from './Sheet';
import Ticket from './Ticket';
import RecipeCard from './RecipeCard';
import { ICON, Photo } from './ui';
import { useStore } from '../store/useStore';
import { directionsUrl, fmtEuro, fmtLongDate, googleMapsUrl, shareText, today } from '../lib/utils';
import { haptic, pickPhoto, shareText as nativeShare } from '../lib/native';
import type { RateTarget } from './RateSheet';

interface Props {
  id: string | null;
  onClose: () => void;
  onRate: (t: NonNullable<RateTarget>) => void;
}

export default function DetailSheet({ id, onClose, onRate }: Props) {
  const r = useStore((s) => s.restaurants.find((x) => x.id === id));
  const upsert = useStore((s) => s.upsert);
  const removeWithUndo = useStore((s) => s.removeWithUndo);
  const showToast = useStore((s) => s.showToast);
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  const share = async () => {
    if (!r) return;
    if ((await nativeShare(shareText(r), r.name)) === 'copied') showToast('Copiado para pegar donde quieras');
  };

  const home = r?.kind === 'recipe';
  const btn = 'flex items-center justify-center gap-1.5 rounded-full py-3 text-[13.5px] font-semibold';

  return (
    <Sheet open={!!id && !!r} onClose={onClose} title={r?.name} tone="paper">
      {r && (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-3xl">
            <Photo src={r.imageUrl} alt={r.name} category={r.category} className="h-44 w-full" emojiSize="text-6xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic.tap();
                  toggleFavorite(r.id);
                }}
                aria-label={r.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                aria-pressed={!!r.favorite}
                className="grid h-10 w-10 place-items-center rounded-full bg-ink/55 text-paper backdrop-blur"
              >
                <Heart size={18} {...ICON} className={r.favorite ? 'fill-terracotta text-terracotta' : ''} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const url = await pickPhoto();
                    if (!url) return;
                    upsert({ ...r, imageUrl: url });
                    showToast('Foto actualizada');
                  } catch (err) {
                    showToast((err as Error).message);
                  }
                }}
                aria-label={r.imageUrl ? 'Cambiar foto' : 'Añadir foto'}
                className="grid h-10 w-10 place-items-center rounded-full bg-ink/55 text-paper backdrop-blur"
              >
                <Camera size={18} {...ICON} />
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4 text-paper">
              <span
                className={`mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  r.status === 'visited' ? 'bg-sage text-white' : 'bg-paper/90 text-ink'
                }`}
              >
                {r.status === 'visited' ? <Check size={12} {...ICON} /> : <Bookmark size={12} {...ICON} />}
                {r.status === 'visited' ? (home ? 'Cocinado' : 'Pagado · Visitado') : 'Pendiente'}
              </span>
              <h2 className="font-serif text-[34px] leading-none">{r.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-[13px] text-paper/80">
                {r.address && <MapPin size={12} {...ICON} className="shrink-0" />}
                <span className="truncate">{[r.address, r.neighborhood, r.category].filter(Boolean).join(' · ')}</span>
              </p>
            </div>
          </div>

          {/* Datos rápidos: fecha editable de un toque, revisitas, precio y etiquetas */}
          <div className="flex flex-wrap items-center gap-1.5">
            {r.status === 'visited' && (
              <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-sand px-3 py-2 text-[13px] font-semibold">
                <CalendarDays size={14} {...ICON} />
                {fmtLongDate(r.visitDate)}
                <Pencil size={11} {...ICON} className="text-muted" />
                {/* Input nativo invisible encima: al tocar la píldora se abre el calendario del móvil. */}
                <input
                  type="date"
                  value={r.visitDate ?? ''}
                  max={today()}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    upsert({ ...r, visitDate: e.target.value });
                    haptic.tap();
                    showToast('Fecha cambiada');
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Cambiar la fecha"
                />
              </label>
            )}
            {r.status === 'visited' && (
              <button
                type="button"
                onClick={() => {
                  const d = today();
                  if (r.visitDate === d || r.revisits?.includes(d)) return showToast('Hoy ya está apuntado');
                  const prev = r;
                  upsert({ ...r, revisits: [...(r.revisits ?? []), d] });
                  haptic.success();
                  showToast(home ? '¡Otra vez! Apuntado' : '¡Volvisteis! Visita apuntada', () => upsert(prev));
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-2 text-[13px] font-semibold text-sage"
              >
                <Repeat size={14} {...ICON} /> {home ? 'La repetimos' : 'Volvimos'}
                {(r.revisits?.length ?? 0) > 0 && <span className="font-mono">×{(r.revisits?.length ?? 0) + 1}</span>}
              </button>
            )}
            {r.priceLevel && (
              <span className="rounded-full bg-sand px-3 py-2 font-mono text-[13px] font-bold">{'€'.repeat(r.priceLevel)}</span>
            )}
            {r.tags?.map((t) => (
              <span key={t} className="rounded-full bg-sand px-3 py-2 text-[13px] text-muted">
                #{t}
              </span>
            ))}
          </div>

          {!home && (r.phone || r.website || r.coordinates || r.address) && (
            <div className="flex gap-2">
              {r.phone && (
                <a href={`tel:${r.phone.replace(/\s/g, '')}`} className={`${btn} flex-1 bg-sand text-ink`}>
                  <Phone size={15} {...ICON} /> Llamar
                </a>
              )}
              {r.website && (
                <a href={r.website} target="_blank" rel="noreferrer" className={`${btn} flex-1 bg-sand text-ink`}>
                  <Globe size={15} {...ICON} /> Web
                </a>
              )}
              <a
                href={googleMapsUrl(r)}
                target="_blank"
                rel="noreferrer"
                className={`${btn} flex-1 bg-sand text-ink`}
                title="Ver reseñas, horario y carta en Google Maps"
              >
                <Star size={15} {...ICON} /> Reseñas
              </a>
            </div>
          )}

          {home && <RecipeCard r={r} onEdit={() => onRate({ id: r.id, step: 'receta' })} />}

          {r.status === 'visited' ? (
            <Ticket r={r} />
          ) : (
            <div className="space-y-3 rounded-2xl border border-line bg-cream p-4">
              {r.pricePerPerson != null && (
                <div className="flex items-baseline justify-between font-mono text-[13px]">
                  <span className="text-muted">PRESUPUESTO / PERSONA</span>
                  <span className="text-ink">~{fmtEuro(r.pricePerPerson)}</span>
                </div>
              )}
              {r.bestDish && (
                <div className="rounded-xl bg-sand px-3 py-2">
                  <p className="font-mono text-[10px] tracking-[0.2em] text-muted">QUEREMOS PROBAR</p>
                  <p className="text-[14px]">{r.bestDish}</p>
                </div>
              )}
              {r.notes && <p className="font-serif text-[19px] leading-snug text-ink/85 italic">“{r.notes}”</p>}
              <button
                type="button"
                onClick={() => onRate({ id: r.id, evaluate: true })}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3.5 font-semibold text-white transition-colors hover:bg-terracotta-dark"
              >
                <ReceiptText size={18} {...ICON} />
                {home ? 'Ya lo cocinamos: votar' : 'Ya fuimos: pasar la cuenta'}
              </button>
            </div>
          )}

          <div className={`grid gap-2 ${home ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {!home &&
              (r.coordinates ? (
                <a href={directionsUrl(r.coordinates)} target="_blank" rel="noreferrer" className={`${btn} bg-ink text-paper`}>
                  <Navigation size={15} {...ICON} /> Ir
                </a>
              ) : (
                <button type="button" onClick={() => onRate({ id: r.id, step: 'donde' })} className={`${btn} bg-ink text-paper`}>
                  <MapPinPlus size={15} {...ICON} /> Ubicar
                </button>
              ))}
            <button type="button" onClick={share} className={`${btn} bg-sand text-ink`}>
              <Share2 size={15} {...ICON} /> Compartir
            </button>
            <button type="button" onClick={() => onRate({ id: r.id })} className={`${btn} bg-sand text-ink`}>
              <Pencil size={15} {...ICON} /> Editar
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              removeWithUndo(r.id);
              onClose();
            }}
            className="mx-auto flex items-center gap-1.5 text-[13px] text-muted hover:text-terracotta"
          >
            <Trash2 size={14} {...ICON} /> Eliminar
          </button>
        </div>
      )}
    </Sheet>
  );
}
