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
import { capterDefilement } from '../components/kit';

/** Ce qui peut recevoir le focus dans une boîte de dialogue. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Élément qui a le focus, en descendant dans les Shadow DOM : vu du document,
 * le focus d'un champ du bloc Softr est porté par l'hôte du bloc.
 */
function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  // `onClose` est souvent une flèche recréée à chaque rendu du parent. En
  // dépendance de l'effet, elle le relançait à chaque rendu : le focus était
  // repris au champ en cours de saisie, ce qui le validait à moitié tapé.
  // Lue par référence, elle ne relance plus rien.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    restoreTo.current = deepActiveElement();

    const node = ref.current;
    // Le focus part sur le premier contrôle marqué, à défaut sur la boîte.
    const first = node?.querySelector<HTMLElement>('[data-autofocus]');
    if (first) first.focus();
    else node?.focus();

    const onKey = (e: KeyboardEvent) => {
      // Deux boîtes peuvent s'empiler (la gestion des statuts s'ouvre depuis
      // une fiche) : seule celle du dessus réagit, sinon `Échap` fermerait
      // les deux et le piège de focus de l'une se battrait avec l'autre.
      // Cherchées dans la racine de la boîte, pas dans `document` : dans le
      // bloc Softr, l'app vit dans un Shadow DOM que `document` ne voit pas.
      const root = (node?.getRootNode() ?? document) as Document | ShadowRoot;
      const open = root.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (node && open.length && open[open.length - 1] !== node) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable.length) return;
      const start = focusable[0];
      const end = focusable[focusable.length - 1];

      // Tab en fin de liste revient au début, et l'inverse : le focus ne
      // s'échappe pas vers la page masquée derrière.
      const current = deepActiveElement();
      if (e.shiftKey && current === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && current === end) {
        e.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Défilement captif (CRM 3, 26/10) : dans Softr, `body` n'est pas ce qui
    // défile ; la molette passait à la page derrière le voile. Le voile (parent
    // du panneau) ne laisse défiler que les zones défilantes de la boîte.
    const relacher = capterDefilement(node?.parentElement ?? node ?? document.body);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      relacher();
      // Rendre le focus là où il était : sans cela, on se retrouve en haut de
      // page après avoir fermé une fiche ouverte depuis le bas d'une liste.
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  return ref;
}
