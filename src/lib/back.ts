import { useEffect, useRef } from 'react';

/**
 * Pila de "cosas abiertas" para el botón Atrás de Android:
 * cada hoja, mapa o modo cocina se apunta mientras está abierto y Atrás cierra el último.
 */
const stack: { current: () => void }[] = [];

/** Cierra lo último abierto. Devuelve false si no había nada. */
export function popBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

export function useBackHandler(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
