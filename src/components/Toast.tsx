import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';

/** Aviso flotante sobre el dock, con "Deshacer" cuando aplica. */
export default function Toast() {
  const toast = useStore((s) => s.toast);
  const hide = useStore((s) => s.hideToast);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(hide, toast.undo ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast, hide]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[1300] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-ink py-2.5 pr-2.5 pl-4 text-[14px] text-paper shadow-lift"
          >
            <span className="truncate">{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  hide();
                }}
                className="shrink-0 rounded-full bg-paper/15 px-3 py-1 text-[13px] font-semibold text-gold-soft"
              >
                Deshacer
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
