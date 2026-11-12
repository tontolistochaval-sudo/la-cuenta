import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { ICON } from './ui';
import { useBackHandler } from '../lib/back';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  tone?: 'cream' | 'paper';
  /** Alto fijo (para flujos por pasos) en lugar de ajustarse al contenido. */
  tall?: boolean;
}

/** Bottom sheet: se arrastra desde el asa para cerrar. */
export default function Sheet({ open, onClose, title, children, tone = 'cream', tall }: Props) {
  const drag = useDragControls();

  const panel = useRef<HTMLDivElement>(null);
  useBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Foco a la hoja para lectores de pantalla y teclado; al cerrar, vuelve donde estaba.
    // (Escape y el botón Atrás los gestiona la pila de lib/back.ts: cierran solo lo de arriba.)
    const t = window.setTimeout(() => panel.current?.focus({ preventScroll: true }), 50);
    return () => {
      clearTimeout(t);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1100]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-xl flex-col outline-none rounded-t-3xl border-t border-line shadow-lift ${
              tall ? 'h-[90dvh]' : 'max-h-[92dvh]'
            } ${tone === 'paper' ? 'bg-paper' : 'bg-cream'}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 pt-3 pb-1 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="w-9" />
              <span className="h-1.5 w-10 rounded-full bg-stone-300" aria-hidden />
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-sand text-muted hover:text-ink"
                aria-label="Cerrar"
              >
                <X size={18} {...ICON} />
              </button>
            </div>
            <div
              className={`min-h-0 flex-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
                tall ? 'flex flex-col' : 'overflow-y-auto overscroll-contain'
              }`}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
