/**
 * Primitives du Kit de code CRM 3 (Notion « Kit de code — primitives à copier telles quelles »),
 * reprises des blocs TICKETING / FACTURATION le 23/11/2026 pour la page « Suivi des demandes ».
 *
 * - `T` : tokens du Kit §1 (couleurs, ombres, rayons).
 * - `Deroulant` : menus maison (§15 ter), plus aucun `<select>` natif.
 * - `Tooltip` / `TooltipRacine` : infobulles (§14 ter), plus de `title=` natif.
 * - `ChampDate` : champ de date (§15 bis), plus d'`<input type="date">` nu.
 * - `Monogram` : rond d'initiales en aplat teal mat (30/09).
 * - `capterDefilement` : la molette ne fait défiler que la modale (26/10).
 *
 * Mise en page en inline, comme dans le Kit : rien ne dépend d'une classe Tailwind,
 * et la même pièce rend pareil dans le bloc Softr (Shadow DOM) et sur Vercel.
 */
// Imports sous des noms propres au Kit (`kUseState`, `KCheck`…), exprès : dans
// le bloc Softr (un seul fichier), un nom déjà pris ailleurs ferait renuméroter
// par le bundler les alias de tous les autres modules (`useState2` →
// `useState3`…), et chaque livraison deviendrait un diff de tout le fichier.
import {
  CalendarDays as KCalendarDays,
  Check as KCheck,
  ChevronDown as KChevronDown,
  Search as KSearch,
  User as KUser,
  X as KX,
} from 'lucide-react';
import {
  Fragment as KFragment,
  cloneElement as kCloneElement,
  createContext as kCreateContext,
  isValidElement as kIsValidElement,
  useContext as kUseContext,
  useEffect as kUseEffect,
  useLayoutEffect as kUseLayoutEffect,
  useMemo as kUseMemo,
  useRef as kUseRef,
  useState as kUseState,
} from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  FocusEvent as ReactFocusEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from 'react';

/* ------------------------------------------------------------------ tokens */

export const T = {
  canvas: '#F3F6F7', surface: '#FFFFFF', surface2: '#F8FAFB',
  line: '#EAEEF0', line2: '#E0E6E9',
  ink: '#101A28', ink2: '#465264', ink3: '#6A7686', ink4: '#9AA5B2',
  brand: '#0E9384', brand600: '#0B7A6E', brand700: '#0A5F56', brand050: '#EBF8F6', brand100: '#CFEEEA',
  solar: '#F59E0B', solar600: '#D97706', solar050: '#FEF5E6', solar100: '#FCE9C4',
  danger: '#DC2626', danger050: '#FEF2F2', dangerInk: '#B91C1C',
  neutral050: '#F1F4F7', tabLine: '#C9DCD6',
  shSm: '0 1px 2px rgba(16,26,40,.05), 0 1px 3px rgba(16,26,40,.05)',
  shMd: '0 6px 16px -6px rgba(16,26,40,.14), 0 2px 6px -2px rgba(16,26,40,.08)',
  rXl: '18px', rLg: '15px', rMd: '11px', rSm: '8px',
  font: "'Plus Jakarta Sans', system-ui, sans-serif",
};

export const INPUT_STYLE: CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px', color: T.ink, fontWeight: 500,
  border: `1px solid ${T.line2}`, borderRadius: T.rMd, padding: '9px 11px', backgroundColor: T.surface, outline: 'none',
};

/* ------------------------------------------------------------------ outils */

export const useEffetDeMise = typeof document !== 'undefined' ? kUseLayoutEffect : kUseEffect;

export const sansAccent = (v: string) =>
  (v ?? '').normalize('NFD').replace(new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g'), '').toLowerCase();

/** « Dehors » se lit sur composedPath() : dans le bloc Softr (Shadow DOM), `contains(e.target)` se tromperait. */
export function clicDehors(e: MouseEvent, box: HTMLElement | null): boolean {
  if (!box) return false;
  const chemin = typeof e.composedPath === 'function' ? e.composedPath() : [];
  return chemin.length ? !chemin.includes(box) : !box.contains(e.target as Node);
}

/**
 * Ouverture au `mousedown` (le `click` n'est pas fiable dans l'app Softr publiée), propagation
 * stoppée (sinon l'écouteur « clic dehors » posé à l'ouverture refermerait aussitôt). Un `click`
 * sans pointeur (`detail === 0` : clavier, lecteur d'écran, tests) déclenche aussi.
 */
export const tkPress = (fn: () => void) => ({
  onMouseDown: (e: ReactMouseEvent) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); fn(); },
  onClick: (e: ReactMouseEvent) => { if (e.detail === 0) fn(); },
});

/**
 * Menus au-dessus des cartes (30/10) : une carte parente qui crée un contexte d'empilement
 * enfermerait le zIndex du menu ; on la hisse tant que le menu est ouvert.
 */
export function hisserCadres(depart: Element | null): () => void {
  const hisses: [HTMLElement, string, string][] = [];
  let n: Node | null = depart?.parentNode ?? null;
  while (n && n !== document.documentElement) {
    if (typeof ShadowRoot !== 'undefined' && n instanceof ShadowRoot) { n = n.host; continue; }
    if (n instanceof HTMLElement) {
      const s = getComputedStyle(n);
      const flou = (s as unknown as { backdropFilter?: string }).backdropFilter ?? 'none';
      const repere = s.transform !== 'none' || s.filter !== 'none' || flou !== 'none' || s.perspective !== 'none'
        || /transform|filter|perspective/.test(s.willChange) || /paint|layout|strict|content/.test(s.contain);
      const piege = repere || s.zIndex !== 'auto' || s.isolation === 'isolate' || Number(s.opacity) < 1
        || /opacity/.test(s.willChange) || s.mixBlendMode !== 'normal';
      if (piege && !(Number(s.zIndex) >= 2500)) {
        hisses.push([n, n.style.zIndex, n.style.position]);
        if (s.position === 'static' && repere) n.style.position = 'relative';
        n.style.zIndex = '2500';
      }
    }
    n = n.parentNode;
  }
  return () => { for (const [el, z, p] of hisses) { el.style.zIndex = z; el.style.position = p; } };
}

/* --------------------------------------------------- défilement captif (26/10) */

function peutDefiler(cible: EventTarget | null, borne: HTMLElement, dy: number): boolean {
  for (let el = cible instanceof Element ? cible : null; el && el !== borne; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) continue;
    const oy = window.getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  }
  return false;
}

/**
 * `capterDefilement(voile)` : tant que la modale est ouverte, molette et doigt ne font défiler QUE ses zones défilantes ;
 * un geste qu'elles ne peuvent absorber est annulé (il passerait sinon à la page Softr derrière).
 */
export function capterDefilement(voile: HTMLElement): () => void {
  const html = document.documentElement;
  const avant = html.style.overflow;
  html.style.overflow = 'hidden';
  const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !peutDefiler(e.target, voile, e.deltaY)) e.preventDefault(); };
  let y0 = 0;
  const onStart = (e: TouchEvent) => { y0 = e.touches[0]?.clientY ?? 0; };
  const onMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY ?? y0;
    if (e.cancelable && !peutDefiler(e.target, voile, y0 - y)) e.preventDefault();
    y0 = y;
  };
  voile.addEventListener('wheel', onWheel, { passive: false });
  voile.addEventListener('touchstart', onStart, { passive: true });
  voile.addEventListener('touchmove', onMove, { passive: false });
  return () => {
    html.style.overflow = avant;
    voile.removeEventListener('wheel', onWheel);
    voile.removeEventListener('touchstart', onStart);
    voile.removeEventListener('touchmove', onMove);
  };
}

/* ---------------------------------------------------------- infobulles (§14 ter) */

type TooltipPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
type TooltipEtat = { contenu: ReactNode; cible: HTMLElement; placement: TooltipPlacement; cle: number };
type TooltipApi = {
  montrer: (cible: HTMLElement, contenu: ReactNode, opts?: { placement?: TooltipPlacement; delai?: number; immediat?: boolean }) => void;
  cacher: () => void;
};
const TooltipCtx = kCreateContext<TooltipApi | null>(null);
const TOOLTIP_ID = 'sdc-tooltip';
const TOOLTIP_DELAI = 1000;
const TOOLTIP_FERMETURE = 100;
const TIP = { bg: '#FFFFFF', border: 'rgba(0,0,0,0.15)', ink: '#5F5E5A', shadow: '0 4px 12px rgba(0,0,0,0.06)' };
const sansSurvol = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;
const menuOuvert = (el: HTMLElement) => el.matches('[aria-expanded="true"]') || !!el.querySelector('[aria-expanded="true"]');
function porteurTooltip(el: HTMLElement): HTMLElement {
  return el.matches('button, a, [tabindex]') ? el : ((el.querySelector('button, a, [tabindex]') as HTMLElement | null) ?? el);
}

function useTooltips() {
  const [etat, setEtat] = kUseState<TooltipEtat | null>(null);
  const tOuvrir = kUseRef<number | undefined>(undefined);
  const tFermer = kUseRef<number | undefined>(undefined);
  const api = kUseMemo<TooltipApi>(() => ({
    montrer: (cible, contenu, opts) => {
      window.clearTimeout(tOuvrir.current);
      window.clearTimeout(tFermer.current);
      if (menuOuvert(cible)) return;
      const go = () => {
        if (!cible.isConnected || menuOuvert(cible)) return;
        setEtat((b) => ({ contenu, cible, placement: opts?.placement ?? 'bottom-start', cle: b && b.cible === cible ? b.cle : (b?.cle ?? 0) + 1 }));
      };
      if (opts?.immediat) go();
      else tOuvrir.current = window.setTimeout(go, opts?.delai ?? TOOLTIP_DELAI);
    },
    cacher: () => {
      window.clearTimeout(tOuvrir.current);
      window.clearTimeout(tFermer.current);
      tFermer.current = window.setTimeout(() => setEtat(null), TOOLTIP_FERMETURE);
    },
  }), []);
  const cible = etat?.cible;
  kUseEffect(() => {
    if (!cible) return;
    const p = porteurTooltip(cible);
    p.setAttribute('aria-describedby', TOOLTIP_ID);
    return () => { if (p.getAttribute('aria-describedby') === TOOLTIP_ID) p.removeAttribute('aria-describedby'); };
  }, [cible]);
  kUseEffect(() => {
    if (!etat) return;
    const fermer = () => api.cacher();
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { window.clearTimeout(tFermer.current); setEtat(null); } };
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('scroll', fermer, true); window.removeEventListener('keydown', touche); };
  }, [etat, api]);
  kUseEffect(() => () => { window.clearTimeout(tOuvrir.current); window.clearTimeout(tFermer.current); }, []);
  return { etat, api };
}

/**
 * `<Tooltip content="…">{déclencheur}</Tooltip>` : ouverture après 1 s au survol, immédiate au
 * focus clavier. Le déclencheur garde ses gestionnaires (chaînés). Sans `TooltipRacine` au-dessus
 * (tests), le déclencheur est rendu tel quel.
 */
export function Tooltip({ content, placement = 'bottom-start', delay = TOOLTIP_DELAI, children }: {
  content: ReactNode; placement?: TooltipPlacement; delay?: number; children: ReactElement;
}) {
  const api = kUseContext(TooltipCtx);
  if (!api || !content || !kIsValidElement(children)) return children;
  const p = children.props as Record<string, ((e: unknown) => void) | undefined>;
  return kCloneElement(children, {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { p.onMouseEnter?.(e); if (!sansSurvol()) api.montrer(e.currentTarget, content, { placement, delai: delay }); },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => { p.onMouseLeave?.(e); api.cacher(); },
    onFocus: (e: ReactFocusEvent<HTMLElement>) => { p.onFocus?.(e); if ((e.target as HTMLElement)?.matches?.(':focus-visible')) api.montrer(e.currentTarget, content, { placement, immediat: true }); },
    onBlur: (e: ReactFocusEvent<HTMLElement>) => { p.onBlur?.(e); api.cacher(); },
    onMouseDown: (e: ReactMouseEvent<HTMLElement>) => { p.onMouseDown?.(e); api.cacher(); },
  } as Record<string, unknown>);
}

function TooltipVue({ etat, racine }: { etat: TooltipEtat | null; racine: RefObject<HTMLElement | null> }) {
  const [vue, setVue] = kUseState<TooltipEtat | null>(etat);
  const ref = kUseRef<HTMLDivElement | null>(null);
  const fleche = kUseRef<HTMLSpanElement | null>(null);
  const derniereCle = kUseRef(-1);
  const sortie = kUseRef<Animation | null>(null);
  const reduit = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  kUseEffect(() => {
    if (etat) { sortie.current?.cancel(); sortie.current = null; setVue(etat); return; }
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') { setVue(null); return; }
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-in', fill: 'forwards' });
    sortie.current = a;
    a.onfinish = () => { if (sortie.current === a) { sortie.current = null; setVue(null); } };
  }, [etat]);

  useEffetDeMise(() => {
    const el = ref.current, root = racine.current;
    if (!vue || !el || !root) return;
    if (!vue.cible.isConnected) { setVue(null); return; }
    el.style.left = '0px';
    el.style.top = '0px';
    const r = vue.cible.getBoundingClientRect();
    const R = root.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const DECALAGE = 8, MARGE = 8;
    const [cote, alignement] = vue.placement.split('-') as ['bottom' | 'top', 'start' | 'end'];
    const placeDessous = vh - r.bottom - DECALAGE - MARGE >= h;
    const placeDessus = r.top - DECALAGE - MARGE >= h;
    let dessous = cote === 'bottom';
    if (dessous && !placeDessous && placeDessus) dessous = false;
    else if (!dessous && !placeDessus && placeDessous) dessous = true;
    let gauche = alignement === 'end' ? r.right - w : r.left;
    gauche = Math.max(MARGE, Math.min(gauche, vw - MARGE - w));
    const haut = dessous ? r.bottom + DECALAGE : r.top - DECALAGE - h;
    el.style.left = `${gauche - R.left}px`;
    el.style.top = `${haut - R.top}px`;
    const vise = alignement === 'end' ? r.right - Math.min(24, r.width / 2) : r.left + Math.min(24, r.width / 2);
    const x = Math.max(12, Math.min(vise - gauche, w - 12));
    const f = fleche.current;
    if (f) {
      f.style.left = `${x - 4.5}px`;
      f.style.top = dessous ? '-5px' : 'auto';
      f.style.bottom = dessous ? 'auto' : '-5px';
      f.style.borderWidth = dessous ? '0.5px 0 0 0.5px' : '0 0.5px 0.5px 0';
    }
    el.style.visibility = 'visible';
    if (vue.cle !== derniereCle.current && typeof el.animate === 'function') {
      derniereCle.current = vue.cle;
      el.animate(
        reduit ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${dessous ? -2 : 2}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 120, easing: 'ease-out' },
      );
    }
  }, [vue]);

  if (!vue) return null;
  return (
    <div ref={ref} id={TOOLTIP_ID} role="tooltip"
      style={{ position: 'absolute', left: 0, top: 0, zIndex: 3000, visibility: 'hidden', pointerEvents: 'none', width: 'max-content', maxWidth: 260, boxSizing: 'border-box', padding: '9px 12px', background: TIP.bg, border: `0.5px solid ${TIP.border}`, borderRadius: 8, boxShadow: TIP.shadow, color: TIP.ink, fontSize: 13, lineHeight: 1.5, fontWeight: 400, whiteSpace: 'normal', textAlign: 'left', fontFamily: T.font }}>
      {vue.contenu}
      <span ref={fleche} aria-hidden="true" style={{ position: 'absolute', top: -5, left: 19.5, width: 9, height: 9, boxSizing: 'border-box', background: TIP.bg, borderStyle: 'solid', borderColor: TIP.border, borderWidth: '0.5px 0 0 0.5px', transform: 'rotate(45deg)' }} />
    </div>
  );
}

/** Racine des infobulles : UN tooltip pour toute la page, positionné dans ce cadre (relatif). */
export function TooltipRacine({ children, className }: { children: ReactNode; className?: string }) {
  const racine = kUseRef<HTMLDivElement | null>(null);
  const { etat, api } = useTooltips();
  return (
    <TooltipCtx.Provider value={api}>
      <div ref={racine} className={className} style={{ position: 'relative' }}>
        {children}
        <TooltipVue etat={etat} racine={racine} />
      </div>
    </TooltipCtx.Provider>
  );
}

/* --------------------------------------------------------- menus (§15 ter) */

export type ChoixDeroulant = {
  v: string; l: string; rendu?: ReactNode; groupe?: string; desactive?: boolean;
  /** Texte cherché (défaut : `l`). */
  recherche?: string;
};

/**
 * Menu déroulant maison : bouton déclencheur habillé par l'appelant + menu `position: fixed`
 * calé sur lui (retourné vers le haut s'il déborde), zIndex 2500 (au-dessus des pop-ups 2000,
 * sous les infobulles 3000). Fermé au clic dehors, au défilement hors du menu, au redimensionnement.
 * Clavier : Entrée / Espace / ↓ ouvrent, ↑ ↓ déplacent, Entrée choisit, Échap ferme (sans fermer
 * la pop-up qui le contient).
 */
export function Deroulant({ choix, valeur, onChoisir, contenu, titre, recherche, aide, ariaLabel, id, btnStyle, disabled, largeurMin = 240, pleineLargeur, autoFocus }: {
  choix: ChoixDeroulant[]; valeur: string; onChoisir: (v: string) => void; contenu: (ouvert: boolean) => ReactNode;
  titre?: string; recherche?: string; aide?: string; ariaLabel?: string; id?: string; btnStyle?: CSSProperties;
  disabled?: boolean; largeurMin?: number; pleineLargeur?: boolean; autoFocus?: boolean;
}) {
  const [pos, setPos] = kUseState<CSSProperties | null>(null);
  const [actif, setActif] = kUseState(-1);
  const [q, setQ] = kUseState('');
  const btnRef = kUseRef<HTMLButtonElement | null>(null);
  const menuRef = kUseRef<HTMLDivElement | null>(null);
  const rechRef = kUseRef<HTMLInputElement | null>(null);
  const listeRef = kUseRef<HTMLDivElement | null>(null);
  const ouvert = !!pos;
  const mots = sansAccent(q).split(/\s+/).filter(Boolean);
  const vus = mots.length ? choix.filter((c) => { const h = sansAccent(c.recherche ?? c.l); return mots.every((m) => h.includes(m)); }) : choix;
  const fermer = () => setPos(null);
  const ouvrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || disabled) return;
    const largeur = Math.max(largeurMin, r.width);
    setQ('');
    setActif(Math.max(0, choix.findIndex((c) => c.v === valeur)));
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8)), top: r.bottom + 6, width: largeur });
  };
  useEffetDeMise(() => {
    const m = menuRef.current, r = btnRef.current?.getBoundingClientRect();
    if (!m || !r || pos?.top == null) return;
    const h = m.getBoundingClientRect().height;
    if (r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8) setPos((p) => (p ? { left: p.left, width: p.width, bottom: window.innerHeight - r.top + 6 } : p));
  }, [pos]);
  kUseEffect(() => {
    if (!ouvert) return;
    const rendre = hisserCadres(btnRef.current);
    (rechRef.current ?? listeRef.current)?.focus({ preventScroll: true });
    const dehors = (e: MouseEvent) => { if (clicDehors(e, btnRef.current) && clicDehors(e, menuRef.current)) fermer(); };
    const defile = (e: Event) => { if (!e.composedPath?.().includes(menuRef.current as EventTarget)) fermer(); };
    document.addEventListener('mousedown', dehors);
    window.addEventListener('scroll', defile, true);
    window.addEventListener('resize', fermer);
    return () => { rendre(); document.removeEventListener('mousedown', dehors); window.removeEventListener('scroll', defile, true); window.removeEventListener('resize', fermer); };
  }, [ouvert]);
  kUseEffect(() => { (listeRef.current?.querySelector(`[data-i="${actif}"]`) as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' }); }, [actif]);
  const choisir = (c?: ChoixDeroulant) => { if (!c || c.desactive) return; fermer(); btnRef.current?.focus({ preventScroll: true }); onChoisir(c.v); };
  const onKey = (e: ReactKeyboardEvent) => {
    if (ouvert || e.key !== 'Escape') e.stopPropagation();
    const dansRecherche = e.target === rechRef.current;
    if (!ouvert) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); ouvrir(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); fermer(); btnRef.current?.focus({ preventScroll: true }); }
    else if (e.key === 'Tab') fermer();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(vus.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || (e.key === ' ' && !dansRecherche)) { e.preventDefault(); choisir(vus[actif]); }
  };
  const bouton = (
    <button ref={btnRef} id={id} type="button" disabled={disabled} onKeyDown={onKey} {...tkPress(() => (ouvert ? fermer() : ouvrir()))}
      aria-haspopup="listbox" aria-expanded={ouvert} aria-label={ariaLabel} {...(autoFocus ? { 'data-autofocus': '' } : {})}
      style={{ fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', ...btnStyle }}>
      {contenu(ouvert)}
    </button>
  );
  let groupe: string | undefined;
  return (
    <span onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', minWidth: 0, maxWidth: '100%', ...(pleineLargeur ? { width: '100%' } : {}) }}>
      {aide ? <Tooltip content={aide}>{bouton}</Tooltip> : bouton}
      {pos && (
        <div ref={menuRef} onKeyDown={onKey}
          style={{ position: 'fixed', zIndex: 2500, ...pos, boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.line}`, borderRadius: '12px', boxShadow: '0 16px 36px -12px rgba(16,26,40,.28), 0 2px 6px rgba(16,26,40,.06)', padding: '6px', fontFamily: T.font, textAlign: 'left' }}>
          {titre && <div style={{ padding: '6px 10px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: T.ink4 }}>{titre}</div>}
          {recherche && (
            <div style={{ position: 'relative', margin: '2px 2px 6px' }}>
              <KSearch aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.ink4 }} />
              <input ref={rechRef} role="combobox" aria-expanded="true" value={q} placeholder={recherche} aria-label={recherche}
                onChange={(e) => { setQ(e.target.value); setActif(0); }}
                style={{ ...INPUT_STYLE, padding: '7px 10px 7px 31px', fontSize: '13px', borderRadius: '9px' }} />
            </div>
          )}
          <div ref={listeRef} role="listbox" tabIndex={-1} aria-label={ariaLabel} style={{ maxHeight: 'min(320px, 60vh)', overflowY: 'auto', overscrollBehavior: 'contain', outline: 'none' }}>
            {!vus.length && <div style={{ padding: '10px', fontSize: '13px', color: T.ink4 }}>Aucun résultat pour « {q} ».</div>}
            {vus.map((c, i) => {
              const sel = c.v === valeur;
              const entete = c.groupe && c.groupe !== groupe ? c.groupe : '';
              groupe = c.groupe;
              return (
                <KFragment key={c.v || 'vide-' + i}>
                  {entete && <div role="presentation" style={{ padding: '8px 10px 4px', fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.ink4 }}>{entete}</div>}
                  <div data-i={i} role="option" aria-selected={sel} aria-disabled={c.desactive || undefined} onMouseEnter={() => setActif(i)}
                    onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); choisir(c); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', minHeight: 34, boxSizing: 'border-box', borderRadius: '8px', cursor: c.desactive ? 'default' : 'pointer', opacity: c.desactive ? 0.5 : 1,
                      fontSize: '13.5px', fontWeight: sel ? 700 : 500, color: T.ink, background: i === actif && !c.desactive ? T.surface2 : sel ? T.brand050 : 'transparent' }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '9px', overflow: 'hidden' }}>
                      {c.rendu ?? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>}
                    </span>
                    {sel && <KCheck aria-hidden="true" style={{ width: 15, height: 15, color: T.brand, flex: 'none' }} strokeWidth={2.4} />}
                  </div>
                </KFragment>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Remplaçant d'un `<select>` (SelectJoli du Kit) : bouton au gabarit des champs, menu `Deroulant`.
 * Recherche d'office au-delà de 10 options. `rendu` habille une option (pastille, rond d'initiales).
 */
export function ListeChoix({ value, onChange, options, ariaLabel, attente = '— Choisir —', disabled, style, rendu, recherche, autoFocus, id, compact }: {
  value: string; onChange: (v: string) => void; options: ChoixDeroulant[]; ariaLabel: string; attente?: string;
  disabled?: boolean; style?: CSSProperties; rendu?: (v: string, l: string) => ReactNode; recherche?: string; autoFocus?: boolean; id?: string;
  /** Hauteur réduite (listes d'une ligne de tableau, barre d'actions). */
  compact?: boolean;
}) {
  const sel = options.find((o) => o.v === value);
  const vide = !value && !sel;
  const choix = options.map((o) => ({ ...o, rendu: o.rendu ?? (rendu ? rendu(o.v, o.l) : undefined) }));
  return (
    <span style={{ display: 'flex', minWidth: 0 }}>
      <Deroulant id={id} pleineLargeur autoFocus={autoFocus} choix={choix} valeur={value} onChoisir={onChange} disabled={disabled}
        ariaLabel={ariaLabel} recherche={recherche ?? (options.length > 10 ? 'Rechercher…' : undefined)}
        btnStyle={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', opacity: disabled ? 0.6 : 1,
          ...(compact ? { padding: '6px 9px', fontSize: '12.5px' } : {}), ...style }}
        contenu={(ouvert) => <>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '9px', overflow: 'hidden', color: vide ? T.ink4 : 'inherit' }}>
            {sel?.rendu ?? (sel && rendu ? rendu(sel.v, sel.l) : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel?.l ?? attente}</span>)}
          </span>
          <KChevronDown aria-hidden="true" style={{ width: 16, height: 16, flex: 'none', color: T.ink3, transition: 'transform .15s', transform: ouvert ? 'rotate(180deg)' : 'none' }} />
        </>} />
    </span>
  );
}

/* ------------------------------------------------------- ronds d'initiales */

const AVATAR_MAT = 'linear-gradient(150deg,#12b3a1,#0b7a6e)';
function initiales(nom: string): string {
  const mots = (nom ?? '').trim().split(/[\s@.]+/).filter(Boolean);
  if (!mots.length) return '?';
  return ((mots[0][0] ?? '') + (mots.length > 1 ? mots[mots.length - 1][0] ?? '' : '')).toUpperCase();
}
/** Rond d'initiales du CRM 3 : aplat teal mat, texte blanc, ombre légère (30/09). */
export function Monogram({ name, size = 34 }: { name: string; size?: number }) {
  const ini = initiales(name);
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%',
      background: AVATAR_MAT, color: '#fff', boxShadow: T.shSm, fontSize: size <= 28 ? '10.5px' : '12px', fontWeight: 600, letterSpacing: '.02em' }}>
      {ini === '?' ? <KUser size={Math.round(size * 0.5)} strokeWidth={2} /> : ini}
    </span>
  );
}

/* ------------------------------------------------------ champ de date (§15 bis) */

function dateLisible(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const t = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Champ de date du CRM 3 : tuile calendrier, date en toutes lettres, croix pour effacer. Le
 * calendrier reste celui du navigateur (champ natif transparent par-dessus, `showPicker()` au
 * mousedown). La valeur reste l'ISO aaaa-mm-jj.
 */
export function ChampDate({ value, onChange, min, max, ariaLabel, placeholder = 'Choisir une date', style }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; ariaLabel?: string; placeholder?: string; style?: CSSProperties;
}) {
  const ouvrir = (el: HTMLInputElement) => { try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* le clic natif ouvre le calendrier */ } };
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '9px', height: 38, boxSizing: 'border-box', padding: '0 6px 0 7px', borderRadius: T.rMd, border: `1px solid ${T.line2}`, background: T.surface, cursor: 'pointer', minWidth: 200, ...style }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '7px', flex: 'none', display: 'grid', placeItems: 'center', background: value ? T.brand050 : T.neutral050, color: value ? T.brand : T.ink3 }}>
        <KCalendarDays style={{ width: 14, height: 14 }} strokeWidth={1.9} />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: value ? 600 : 500, color: value ? T.ink : T.ink4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value ? dateLisible(value) : placeholder}
      </span>
      <input type="date" value={value} min={min} max={max} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => ouvrir(e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(e.currentTarget); } }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0, fontFamily: 'inherit' }} />
      {value && (
        <Tooltip content="Effacer la date">
          <button type="button" aria-label="Effacer la date"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(''); }}
            onClick={(e) => { e.preventDefault(); if (e.detail === 0) onChange(''); }}
            style={{ position: 'relative', zIndex: 1, flex: 'none', width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: '7px', border: 'none', background: 'transparent', color: T.ink3, cursor: 'pointer' }}>
            <KX style={{ width: 13, height: 13 }} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
