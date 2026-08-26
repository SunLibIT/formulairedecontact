/**
 * Liste déroulante avec recherche.
 *
 * Un `<select>` natif devient inutilisable au-delà d'une vingtaine d'entrées :
 * la table RH en compte 35, il fallait la parcourir à l'œil. Ici on tape
 * quelques lettres.
 *
 * Points d'attention traités :
 *  - `Échap` referme la liste **sans** propager l'événement, sinon la modale
 *    parente se fermerait au premier appui ;
 *  - clic à l'extérieur et perte de focus referment aussi ;
 *  - navigation clavier complète, avec `aria-activedescendant` pour que le
 *    lecteur d'écran suive l'option survolée.
 */
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Complément affiché en gris, non recherché en priorité (service, rôle…). */
  hint?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  searchPlaceholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Libellé de l'option « aucune valeur ». */
  emptyLabel: string;
  searchPlaceholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sens d'ouverture et hauteur disponible, mesurés à l'ouverture. Ouvrir
  // systématiquement vers le bas rendait la liste inutilisable dès que le
  // champ se trouvait en bas d'une modale courte.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [listHeight, setListHeight] = useState(224);

  const collator = useMemo(() => new Intl.Collator('fr', { sensitivity: 'base' }), []);

  // Tri alphabétique systématique, insensible aux accents et à la casse.
  const sorted = useMemo(
    () => [...options].sort((a, b) => collator.compare(a.label, b.label)),
    [options, collator],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((o) =>
      `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  /** L'option vide figure toujours en tête, et n'est pas filtrable. */
  const rows: SelectOption[] = [{ value: '', label: emptyLabel }, ...filtered];

  const selected = options.find((o) => o.value === value);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const MARGIN = 12;
    const SEARCH_ROW = 46;
    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;

    // On préfère le bas ; on bascule vers le haut seulement s'il y est
    // vraiment plus à l'aise.
    const flip = below < 200 && above > below;
    setPlacement(flip ? 'above' : 'below');
    setListHeight(
      Math.max(120, Math.min(288, (flip ? above : below) - SEARCH_ROW)),
    );
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
    setCursor(0);
  }, [open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Sans cet arrêt, la modale parente intercepterait la touche et se
      // fermerait alors que l'utilisateur voulait juste replier la liste.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[cursor];
      if (row) commit(row.value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(rows.length - 1);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2 text-left text-sm transition-colors ${
          open ? 'border-teal shadow-focus' : 'border-line hover:bg-canvas'
        }`}
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-muted'}`}>
          {selected ? selected.label : emptyLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          // `z-40` et non `z-10` : l'en-tête collant de la vue liste est en
          // `z-10` et, plus loin dans le DOM, il peignait par-dessus la liste
          // déroulante — qui apparaissait coupée en deux.
          className={`absolute z-40 w-full overflow-hidden rounded-control border border-line bg-surface shadow-lg ${
            placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={`${listId}-${cursor}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Effacer la recherche"
                className="shrink-0 rounded-full p-0.5 text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="overflow-y-auto py-1"
            style={{ maxHeight: listHeight }}
          >
            {rows.map((row, i) => {
              const isSelected = row.value === value;
              const isCursor = i === cursor;
              return (
                <li
                  key={row.value || '__empty__'}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(row.value)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                    isCursor ? 'bg-teal-soft' : ''
                  } ${isSelected ? 'font-semibold text-teal-ink' : 'text-ink'}`}
                >
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="truncate">{row.label}</span>
                  {row.hint && (
                    <span className="ml-auto shrink-0 truncate text-xs text-muted">{row.hint}</span>
                  )}
                </li>
              );
            })}
            {filtered.length === 0 && query && (
              <li className="px-3 py-2 text-sm text-muted">Aucun résultat</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
