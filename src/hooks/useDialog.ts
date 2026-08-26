/**
 * Mécanique commune à toutes les boîtes de dialogue.
 *
 * Rassemble ce qu'une modale accessible doit faire et qu'on oublie une fois
 * sur deux : piéger le focus à l'intérieur, le rendre à l'élément d'origine en
 * partant, fermer sur `Échap`, et bloquer le défilement de la page derrière.
 *
 * Extrait parce qu'une deuxième modale est apparue : dupliquer un piège de
 * focus est la meilleure façon d'avoir deux comportements légèrement
 * différents, dont un cassé.
 */
import { useEffect, useRef } from 'react';

/** Ce qui peut recevoir le focus dans une boîte de dialogue. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement;

    const node = ref.current;
    // Le focus part sur le premier contrôle marqué, à défaut sur la boîte.
    const first = node?.querySelector<HTMLElement>('[data-autofocus]');
    if (first) first.focus();
    else node?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable.length) return;
      const start = focusable[0];
      const end = focusable[focusable.length - 1];

      // Tab en fin de liste revient au début, et l'inverse : le focus ne
      // s'échappe pas vers la page masquée derrière.
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // Rendre le focus là où il était : sans cela, on se retrouve en haut de
      // page après avoir fermé une fiche ouverte depuis le bas d'une liste.
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return ref;
}
