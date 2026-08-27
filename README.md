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
  lib/deepLink.ts   lien de mail → demande ouverte et filtre appliqué (fonctions pures)
  lib/adminAuth.ts  session d'écriture : jeton, authFetch, fenêtre de connexion
  hooks/useLeads.ts chargement, cache RH, rafraîchissement, garde anti-course
  components/       ui.tsx (primitives de charte), LeadCard, LeadModal, FilterBar
api/
  airtable/         proxy serveur : le token n'entre jamais dans le bundle
  _lib/typeform.ts  correspondance questions Typeform → champs (UUID irremplaçables)
  _lib/auth.ts      droit d'écrire : jetons signés, relecture du droit — POINT UNIQUE
  auth.ts           connexion Google : config, start, retour, me
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
| `TYPEFORM_SECRET` | secret de signature du webhook, voir plus bas |
| `GOOGLE_CLIENT_ID` | client OAuth « Application Web », voir « Écritures protégées » |
| `GOOGLE_CLIENT_SECRET` | son secret |
| `SESSION_SECRET` | secret de signature des jetons de session, inventé par nous |

Les variables ne sont injectées qu'au build : après en avoir ajouté une, il faut
redéployer.

`vercel.json` autorise l'affichage en iframe depuis Softr via
`Content-Security-Policy: frame-ancestors`. `X-Frame-Options` n'est
volontairement pas défini — il bloquerait l'embed. Si Softr est servi sur un
domaine personnalisé, l'ajouter à la directive.

⚠️ **Deployment Protection doit être désactivée.** Avec Vercel Authentication
active, toute URL `.vercel.app` exige une connexion et l'iframe Softr affiche un
écran de login au lieu de l'application. C'est le réglage des autres blocs
in-page SunLib.

## Webhook Typeform

Chaque soumission est poussée vers `/api/typeform-webhook`, qui la mappe et
l'écrit dans Airtable. Il n'y a **plus de token d'API Typeform** dans ce
projet : l'ancienne synchronisation allait chercher les réponses, celle-ci les
reçoit.

`TYPEFORM_SECRET` n'est pas un jeton fourni par Typeform, c'est **un secret
partagé que vous choisissez** :

```bash
openssl rand -base64 32
```

La même valeur se déclare aux deux bouts :

1. Vercel → Environment Variables → `TYPEFORM_SECRET`
2. Typeform, pour **chacun des deux formulaires** (`MtEfRiYk` et `gbPj3B1m`) →
   Connect → Webhooks → Add a webhook
   - Endpoint : `https://<domaine>/api/typeform-webhook`
   - Secret : la même chaîne

Typeform signe alors chaque envoi en HMAC-SHA256 du corps brut ; la fonction
recalcule l'empreinte et compare à temps constant. Signature absente ou
invalide → `401`, rien n'est écrit.

Deux propriétés à connaître :

- **Rejeu sans doublon.** L'écriture est un upsert sur `Response ID`. Typeform
  réémet lorsqu'il ne reçoit pas de `2xx` ; une réémission met à jour la
  demande au lieu d'en créer une seconde. La fonction répond volontairement
  `500` en cas d'échec Airtable, pour déclencher cette reprise.
- **Le suivi commercial n'est jamais écrasé.** `Statut` et `Priorité` ne sont
  posés qu'à la création. Sans cette précaution, un rejeu ramènerait à
  « Nouveau » une demande déjà qualifiée par un commercial.

Si une question est modifiée dans Typeform, sa `ref` change et le champ arrive
vide **sans erreur**. Toute retouche d'un formulaire impose de vérifier
`api/_lib/typeform.ts`.

## Lien profond — mail d'assignation

Airtable envoie un mail quand une demande change d'assigné. Le lien qu'il porte
ouvre l'application **sur cette demande**, fiche dépliée, la liste derrière
étant filtrée sur les demandes du destinataire :

```
https://formulairedecontact.vercel.app/?lead=recXXXXXXXXXXXXXX&assignee=me&email=prenom@sunlib.fr
```

| Paramètre | Rôle |
| --- | --- |
| `lead` | identifiant d'enregistrement, tel que `RECORD_ID()` le produit |
| `assignee` | `me` (résolu via `email`) ou un identifiant RH explicite |
| `email` | identifie le destinataire, comme le fait Softr |

Le lien **ne dit pas de quelle table vient l'enregistrement** : les deux étant
chargées d'emblée, il est cherché dans l'une puis l'autre et l'onglet suit. Un
mail n'a donc pas à connaître l'organisation interne, et un lien reste valable
si une demande change de table.

Les règles sont dans `lib/deepLink.ts`, en fonctions pures — `App` applique un
plan, il ne le décide pas.

### Côté Airtable

1. Un champ **formule** dans la table des demandes, qui sert aussi de raccourci
   depuis la grille :

   ```
   CONCATENATE("https://formulairedecontact.vercel.app/?lead=", RECORD_ID(), "&assignee=me&email=", {Email assigné})
   ```

   `{Email assigné}` est un **lookup** de l'email à travers le champ lié
   `Assigné à`. Il est de toute façon nécessaire pour adresser le mail.

2. Une automatisation *When record updated*, surveillant le seul champ
   `Assigné à`, qui envoie le mail à ce même lookup en y insérant le champ
   formule.

Trois points à connaître :

- **Les actions groupées déclenchent un mail par ligne.** Le tableau de bord
  écrit par lots via `updateRecords` — réassigner 200 demandes produit 200
  envois. Si ce n'est pas voulu, l'automatisation doit être conditionnée
  (par exemple au seul passage d'un assigné vide à un assigné renseigné).
- **Un lien peut survivre à sa demande.** Enregistrement supprimé, lien
  tronqué par le client mail, identifiant d'une autre base : l'application
  affiche « Demande introuvable » plutôt que de n'ouvrir aucune fiche sans
  rien dire.
- **`email` n'authentifie pas, il identifie.** C'est déjà le cas du `?email=`
  injecté par Softr : l'application n'a pas d'authentification propre, et le
  domaine `.vercel.app` est public — Deployment Protection doit rester
  désactivée pour l'iframe et le webhook. Quiconque détient l'URL voit le
  tableau de bord entier. Le lien du mail ne change donc rien à la surface
  d'exposition, mais il la met dans une boîte de réception : à garder en tête
  avant d'élargir la liste des destinataires.

## Écritures protégées — connexion Google

Le domaine est public : la **lecture** l'est aussi, et le reste. Ce qui change,
c'est que **modifier exige une identité prouvée**.

Avant, le droit d'écrire se décidait sur un email *déclaré* dans l'URL —
`?email=…`, que Softr injecte. Il suffisait d'ouvrir l'application hors de Softr
en écrivant l'adresse d'un collaborateur pour obtenir tous les boutons, et le
serveur ne vérifiait rien du tout. Désormais l'email se **prouve** : le PATCH
exige un jeton de session délivré après une véritable connexion Google.

### Trois fichiers

| Fichier | Rôle |
| --- | --- |
| `api/_lib/auth.ts` | point de passage **unique** : signature et vérification des jetons (HMAC-SHA256, comparaison à temps constant), règle « qui peut écrire », et `requireWriter` que tout endpoint d'écriture appelle. Le préfixe `_` empêche Vercel d'en faire une route |
| `api/auth.ts` | la connexion : `?action=config`, `?action=start&back=…`, le retour `?code=&state=`, `?action=me` |
| `src/lib/adminAuth.ts` | côté page : garde le jeton, le joint aux requêtes (`authFetch`), ouvre la fenêtre, lit le retour. `useAdminAuth` + `AccountButton` n'en sont que l'habillage |

**Le jeton dit QUI, jamais QUOI.** Il ne porte aucune permission : le droit est
relu dans la table RH à chaque écriture. Cocher « Inactif » sur un départ ferme
l'accès dans la seconde, sans attendre l'expiration du jeton (8 h). La règle
retenue est « tout collaborateur actif » — restreindre aux groupes Direction et
Service client retirerait « M'assigner » aux commerciaux, premiers utilisateurs
de l'outil.

Le seul point d'écriture ouvert au navigateur est le `PATCH /api/airtable` :
statut, priorité, assignation, notes et actions groupées y passent tous.
`api/typeform-webhook.ts` écrit aussi, mais il s'authentifie par signature HMAC
de Typeform et ne relève pas d'un utilisateur.

### Les deux contraintes de l'iframe

- **Fenêtre séparée, jamais un formulaire dans la page.** Google refuse
  d'afficher son écran de connexion dans une iframe. La page ouvre donc une
  fenêtre et le résultat revient par `postMessage`, dont l'origine est vérifiée.
  Corollaire : **jamais `noopener` sur le `window.open`** — c'est par
  `window.opener` que le résultat revient ; avec lui, la connexion réussit chez
  Google et la page n'en sait rien. Si la fenêtre est bloquée, repli sur une
  redirection pleine page, le jeton revenant dans le **fragment** de l'URL : un
  fragment ne part vers aucun serveur et n'entre dans aucun journal.
- **Pas de cookie.** Dans l'iframe Softr, les nôtres seraient des cookies tiers,
  donc bloqués par Safari et Firefox. Le jeton voyage en en-tête
  `Authorization` et vit en `sessionStorage` — rien ne survit à la fermeture de
  l'onglet, car sur un poste partagé un jeton qui dort ferait de ce poste un
  administrateur permanent. L'accès au stockage est enveloppé, comme la
  préférence d'affichage : en contexte tiers il peut être cloisonné ou lever à
  la simple lecture, et le jeton retombe alors en mémoire.

### Bascule de régime

Tant que les trois variables ne sont pas **toutes** posées, l'application se
comporte exactement comme avant et le bouton de connexion ne s'affiche même pas.
C'est ce qui permet de déployer ce code avant d'avoir créé le client Google,
sans fenêtre pendant laquelle plus personne ne pourrait rien modifier. Les trois
sont exigées ensemble : avec un client Google mais sans secret de session, on
signerait avec une chaîne vide — pire qu'une absence de contrôle, puisque cela
en aurait l'apparence.

### Mise en service

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client
   ID** → type **Application Web**.
   - Authorized redirect URI : `https://<domaine>/api/auth`
   - Une URI par domaine servi, previews Vercel comprises si l'on veut y tester.
2. Générer le secret de session :

   ```bash
   openssl rand -base64 32
   ```

3. Poser `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `SESSION_SECRET` dans
   Vercel, puis **redéployer** — les variables ne sont injectées qu'au build.

Le bouton « Activer la modification » apparaît alors en haut à droite, seul
point de connexion de l'application. Un compte connecté mais absent de la table
RH conserve la lecture et lit pourquoi il ne peut pas modifier.

### Cache

Les réponses de `/api/airtable` partent en `no-store`, donc rien ne les met en
cache aujourd'hui. Deux précautions sont néanmoins en place, ensemble : la
lecture porte `Vary: Authorization`, et le client ajoute un `auth=1` neutre dès
qu'il détient un jeton. Sans elles, le jour où un cache apparaîtrait, une
réponse anonyme resservie à une requête authentifiée afficherait « lecture
seule » avec une session valide — une panne qui se corrige toute seule à
l'expiration, donc très coûteuse à diagnostiquer.

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
