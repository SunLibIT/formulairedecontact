# Suivi des demandes de contact — SunLib

Tableau de bord de suivi commercial des demandes entrantes. Application React
déployée sur Vercel, destinée à être embarquée en iframe dans Softr, selon le
patron d'architecture interne SunLib.

**Source de données unique : Airtable.** Supabase a été retiré du projet.

## Architecture

```
Typeform ──webhook──► /api/typeform-webhook ──►  Airtable
                                                    │
                          front React ──────────────┘
                                    via /api/airtable (le token reste serveur)
```

Base Airtable **« Simulateur Solaire »** (`appYjCP9BUY8Zj5Ni`) :

| Table | Id | Rôle |
| --- | --- | --- |
| Demandes de contact | `tblcgBrFfVCBrczdl` | Réponses du formulaire Typeform |
| Leads Solaires | `tblg8uig0z4oPUC1x` | Leads du simulateur — **tunnel distinct** |
| RH | `tblySHLLDvHjk2ktK` | Collaborateurs, cible des champs « Assigné à » |
| Formulaire de contact | `tblnTM0YsQLpR7bqg` | Ancienne table, à archiver — ne plus écrire dedans |

## Organisation du code

```
src/
  lib/schema.ts     identifiants de tables et de champs, options, tons — SOURCE UNIQUE
  lib/airtable.ts   transport : pagination, upsert, reprise sur 429, proxy ou direct
  lib/records.ts    normalisation des deux tables vers un type `Lead` commun
  lib/filters.ts    filtrage, tri, compteurs — une seule implémentation
  hooks/useLeads.ts chargement, cache RH, rafraîchissement, garde anti-course
  components/       ui.tsx (primitives de charte), LeadCard, LeadModal, FilterBar
api/
  airtable/         proxy serveur : le token n'entre jamais dans le bundle
  _lib/typeform.ts  correspondance questions Typeform → champs (UUID irremplaçables)
scripts/
  repair-xlsx.py    reconstruit les demandes depuis l'export Excel corrompu
  upload-to-airtable.py  charge le résultat dans Airtable (upsert idempotent)
```

Les champs Airtable sont désignés **par identifiant** (`fld…`), jamais par nom :
renommer un champ dans Airtable n'a aucun effet sur le code.

## Développement

```bash
npm install
cp .env.example .env      # puis renseigner VITE_AIRTABLE_TOKEN
npm run dev
```

`VITE_AIRTABLE_TOKEN` fait appeler Airtable directement, pour travailler sans
`vercel dev`. Un bandeau ambre le signale dans l'interface. **Cette variable ne
doit jamais être définie en production** : toute variable `VITE_` est compilée
dans le bundle navigateur.

```bash
npm run typecheck   # src/ et api/
npm run lint
npm run build
```

## Production (Vercel)

Variables à définir dans Settings → Environment Variables :

| Variable | Rôle |
| --- | --- |
| `AIRTABLE_TOKEN` | PAT, scopes `data.records:read` + `data.records:write` |
| `AIRTABLE_BASE_ID` | optionnel, défaut `appYjCP9BUY8Zj5Ni` |
| `TYPEFORM_SECRET` | secret de signature du webhook |

`vercel.json` autorise l'affichage en iframe depuis Softr via
`Content-Security-Policy: frame-ancestors`. `X-Frame-Options` n'est
volontairement pas défini — il bloquerait l'embed. Si Softr est servi sur un
domaine personnalisé, l'ajouter à la directive.

## Reprise des données historiques

Les 438 demandes antérieures n'existaient plus que dans un export Excel
corrompu (deux exports concaténés, dont un dump CSV écrasé dans une colonne).

```bash
python scripts/repair-xlsx.py <chemin-du-xlsx>
AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py --dry-run
AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py
```

L'upsert porte sur `Response ID` : relancer ne crée pas de doublon.
`scripts/records.json` contient des données personnelles et est gitignoré.

Limites connues de la reprise : 376 des 438 enregistrements n'ont pas de
`Form ID` (absent de l'export), et le champ `Raw JSON` est vide (le `raw_data`
de Supabase est perdu avec la base).

## Charte

L'interface suit la charte UI/UX SunLib : dégradé `#13A3AC → #3CAE68` réservé
au bouton d'action principale, teal `#0EA3B4` en accent et en état actif,
police Plus Jakarta Sans, arrondis 14 px / 10 px, icônes Lucide outline en
famille unique. Un élément actif ne porte jamais de bordure ni de liseré.
Les tokens sont dans `src/index.css` et exposés à Tailwind via
`tailwind.config.js`.
