/**
 * Bloc vibe coding « Suivi des demandes » — CRM 3, page /suivi-des-demandes.
 *
 * Point d'entrée du build Softr (`npm run softr:build`). Il branche les hooks
 * Softr sur les cinq tables de la base « Simulateur Solaire », dépose lectures,
 * mutations et identité dans `pont.ts` / `droits.ts`, puis rend l'app de
 * `src/App.tsx` — la même que sur Vercel — dans `.sdc-root`, avec sa feuille
 * Tailwind compilée (`CSS_APP`, injectée au build).
 *
 * Contraintes Softr : `q.select` en littéraux, valeurs = NOMS Airtable (les
 * alias sont les identifiants de champ, ce qui rend des `fields` indexés par
 * id comme l'API) ; `from:` = directement `DS.xxx`.
 */
import { useEffect, useRef } from 'react';
import {
  datasource,
  q,
  useRecordCreate,
  useRecordDelete,
  useRecordUpdate,
  useRecords,
} from '@/lib/datasource';
import { useCurrentUser } from '@/lib/user';
import App from '../src/App';
import { deposerLecture, enregistrerMutations, type CleTable } from './pont';
import { deposerPersonne, libelles } from './droits';
// Feuille Tailwind de l'app, compilée par `build.mjs` (module virtuel).
import { CSS_APP } from 'virtual:css-app';

const DS = datasource.define({
  demandes: 'demandes',
  leads: 'leads',
  rh: 'rh',
  secteurs: 'secteurs',
  statuts: 'statuts',
});

/* ------------------------------------------------------------- lectures */

const LECTURE_DEMANDES = q.select({
  fld2EHfUcopGI4FzO: 'Response ID',
  fldV3UrrOh3BgL6OW: 'Form ID',
  fldTeBIok4t5SzchH: 'Date soumission',
  fldi2fllcOjhkdnez: 'Prénom',
  fldJsJt1mbsDzllwp: 'Nom',
  fldrwQjAaZVAqgqrH: 'Email',
  fld7719at95masMxZ: 'Téléphone',
  fldbvUdmsqD5fQKwX: 'Entreprise',
  fld02pk6STDA7s6Vx: 'Vous êtes',
  fldW2YL0mDOt9we64: 'Motif',
  fld5XFRNvY4ujHWVc: 'Message',
  fldhcCA8eAcwBcpDT: 'Adresse',
  fld9mIzjniYLw7SQn: "Complément d'adresse",
  fldRJCOMCIJt32nGT: 'Ville',
  fldbzJLzPQEqM2q6t: 'Code postal',
  fldO9LPuTO0PRIPt6: 'Département',
  fldZSqh21vXrfsBq4: 'Région',
  fldGhnX2PkchpW76f: 'Pays',
  fldJ1o4Y2cIb9qq9o: 'Statut (lien)',
  fldZjSSAAZVhcVEeH: 'Statut',
  fldiFRpsqZWu50Puz: 'Priorité',
  fldckAwd6C9Fi6Cdm: 'Partenaire',
  fldzJnDK7zuZ8eExl: 'Assigné à',
  fldQFmXnHOw4Mk3N1: 'Notes',
  flddNjogfg4QRpqeu: 'Consentement RGPD',
});

const LECTURE_LEADS = q.select({
  fldE0cyg8Prbjfl7o: 'Prénom',
  fldnruhlv8yseJ6CV: 'Nom',
  fldJzTTQkF62cAiGw: 'Email',
  fldbzDT4g20G4aLBq: 'Téléphone',
  fldZY1wpZR5PlF9SQ: 'Type de client',
  fldwkxXCNXUNHbc5a: 'Adresse complète',
  fld1mt7gtT4dhGwO5: 'Ville',
  fldHbxSNpARzjzx4U: 'Code postal',
  fld0a0KT5yytGuyZF: 'Date création',
  fldnUeIkyfvfsrM72: 'Statut (lien)',
  fldE04cmRvQCtJEHY: 'Statut',
  fldyMVACirNJuXrmP: 'Priorité',
  fldwHw89pEI8SX8Kv: 'Partenaire',
  fldmf8mnMW7VhlVuA: 'RH',
  fldQoya2KNtmgq3Nx: 'Assigné à',
  fldF946cmgvi0z5U0: 'Notes internes',
  fldFKzyXQe2ZdNNP3: 'Consommation annuelle',
  fldvvjiCGcM7XJsF7: 'Facture mensuelle',
  fld3LX5WHjveMC7fd: 'Puissance recommandée',
  fldADSz4AckvWiPCO: 'Consentement RGPD',
});

const LECTURE_RH = q.select({
  fldELWYPe8utsKKcV: 'Name',
  fldHiVHm25kqusZ08: 'Email',
  fldY8wfV9GKnUZgHB: 'user group',
  fldcYvayoR3Dlthwe: 'Inactif',
});

const LECTURE_SECTEURS = q.select({
  flds31Paku304s0Z6: 'Code département',
  fldpSQXxlL1pLyc53: 'Nom département',
  fldfuhMEJgXxLujHJ: 'Région',
  fldUItpTihZaVfdto: 'Commercial',
  fld9l52OdNgb85eQ0: 'Actif',
});

const LECTURE_STATUTS = q.select({
  fldFWdsjqWBE2qQrq: 'Nom',
  fldQSu5OPIBixDQ0s: 'Couleur',
  flduCvbXs319FEamn: 'Ton',
  fldNrYviRBYPP19BB: 'Ordre',
  fldX3FzdPGxGBPLlw: 'Archivé',
  fldEPq3PpzWuCRsur: 'Rôle',
});

/* ------------------------------------------------------------ écritures */

/** Champs que l'app écrit : suivi (fiche, actions groupées) et fusion des doublons. */
const ECRITURE_DEMANDES = q.select({
  fldJ1o4Y2cIb9qq9o: 'Statut (lien)',
  fldiFRpsqZWu50Puz: 'Priorité',
  fldckAwd6C9Fi6Cdm: 'Partenaire',
  fldzJnDK7zuZ8eExl: 'Assigné à',
  fldQFmXnHOw4Mk3N1: 'Notes',
  fld7719at95masMxZ: 'Téléphone',
  fldbvUdmsqD5fQKwX: 'Entreprise',
  fldhcCA8eAcwBcpDT: 'Adresse',
  fldRJCOMCIJt32nGT: 'Ville',
  fldbzJLzPQEqM2q6t: 'Code postal',
});

const ECRITURE_LEADS = q.select({
  fldnUeIkyfvfsrM72: 'Statut (lien)',
  fldyMVACirNJuXrmP: 'Priorité',
  fldwHw89pEI8SX8Kv: 'Partenaire',
  fldmf8mnMW7VhlVuA: 'RH',
  fldF946cmgvi0z5U0: 'Notes internes',
  fldbzDT4g20G4aLBq: 'Téléphone',
  fldwkxXCNXUNHbc5a: 'Adresse complète',
  fld1mt7gtT4dhGwO5: 'Ville',
  fldHbxSNpARzjzx4U: 'Code postal',
});

const ECRITURE_SECTEURS = q.select({
  flds31Paku304s0Z6: 'Code département',
  fldpSQXxlL1pLyc53: 'Nom département',
  fldfuhMEJgXxLujHJ: 'Région',
  fldUItpTihZaVfdto: 'Commercial',
  fld9l52OdNgb85eQ0: 'Actif',
});

const ECRITURE_STATUTS = q.select({
  fldFWdsjqWBE2qQrq: 'Nom',
  fldQSu5OPIBixDQ0s: 'Couleur',
  fldNrYviRBYPP19BB: 'Ordre',
  fldX3FzdPGxGBPLlw: 'Archivé',
  fldEPq3PpzWuCRsur: 'Rôle',
});

/* -------------------------------------------------------- mécanique Softr */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = any;

/**
 * Softr plafonne une lecture à 100 enregistrements : on enchaîne les pages
 * jusqu'à la dernière (recette des blocs TICKETING / FACTURATION). Une page
 * en échec n'est pas redemandée en boucle.
 */
function useToutesLesPages(res: Res) {
  const nb = res?.data?.pages?.length ?? 0;
  const demandee = useRef(-1);
  useEffect(() => {
    if (res?.status !== 'success' || !res?.hasNextPage || res?.isFetchingNextPage || demandee.current === nb) return;
    demandee.current = nb;
    res.fetchNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res?.status, res?.hasNextPage, res?.isFetchingNextPage, nb]);
}

/** Dépose l'état de la lecture dans `pont.ts` dès qu'il change. */
function useDepot(table: CleTable, res: Res) {
  useToutesLesPages(res);
  const relire = useRef<() => void>(() => {});
  relire.current = () => {
    void res?.refetch?.();
  };
  const complet = res?.status === 'success' && !res?.hasNextPage && !res?.isFetching;
  const erreur = res?.status === 'error' ? String(res?.error?.message ?? res?.error ?? 'Chargement impossible') : '';
  useEffect(() => {
    deposerLecture(table, {
      complet,
      erreur,
      items: complet ? (res?.data?.pages ?? []).flatMap((p: Res) => p?.items ?? []) : [],
      relire: () => relire.current(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, complet, erreur, res?.data]);
}

/** Les fonctions de mutation Softr, à la forme attendue par `pont.ts`. */
function mutations(update?: Res, create?: Res, remove?: Res) {
  return {
    update: update?.enabled
      ? (recordId: string, fields: Record<string, unknown>) => update.mutateAsync({ recordId, fields })
      : undefined,
    create: create?.enabled ? (fields: Record<string, unknown>) => create.mutateAsync(fields) : undefined,
    remove: remove?.enabled ? (recordId: string) => remove.mutateAsync(recordId) : undefined,
  };
}

const PROPRIETES_UTILISATEUR = {
  type: 'Type',
  service: 'Service',
  acces: 'Accès plateforme sunlib',
};

export default function Block() {
  /* Identité : la fiche Utilisateurs de la personne connectée. */
  const user = useCurrentUser({ properties: PROPRIETES_UTILISATEUR }) as Res;
  deposerPersonne({
    email: String(user?.email ?? '').trim(),
    nom: String(user?.fullName ?? '').trim(),
    types: libelles(user?.properties?.type),
    services: libelles(user?.properties?.service),
    acces: libelles(user?.properties?.acces)[0] ?? '',
  });

  /* Lectures : les cinq tables entières, triées comme sur Vercel. */
  const demandes = useRecords({ from: DS.demandes, select: LECTURE_DEMANDES, orderBy: q.desc('fldTeBIok4t5SzchH'), count: 100 });
  const leads = useRecords({ from: DS.leads, select: LECTURE_LEADS, orderBy: q.desc('fld0a0KT5yytGuyZF'), count: 100 });
  const rh = useRecords({ from: DS.rh, select: LECTURE_RH, count: 100 });
  const secteurs = useRecords({ from: DS.secteurs, select: LECTURE_SECTEURS, count: 100 });
  const statuts = useRecords({ from: DS.statuts, select: LECTURE_STATUTS, count: 100 });
  useDepot('demandes', demandes);
  useDepot('leads', leads);
  useDepot('rh', rh);
  useDepot('secteurs', secteurs);
  useDepot('statuts', statuts);

  /* Écritures. */
  const majDemandes = useRecordUpdate({ from: DS.demandes, fields: ECRITURE_DEMANDES });
  const majLeads = useRecordUpdate({ from: DS.leads, fields: ECRITURE_LEADS });
  const majSecteurs = useRecordUpdate({ from: DS.secteurs, fields: ECRITURE_SECTEURS });
  const ajoutSecteurs = useRecordCreate({ from: DS.secteurs, fields: ECRITURE_SECTEURS });
  const suppSecteurs = useRecordDelete({ from: DS.secteurs });
  const majStatuts = useRecordUpdate({ from: DS.statuts, fields: ECRITURE_STATUTS });
  const ajoutStatuts = useRecordCreate({ from: DS.statuts, fields: ECRITURE_STATUTS });
  const suppStatuts = useRecordDelete({ from: DS.statuts });
  enregistrerMutations('demandes', mutations(majDemandes));
  enregistrerMutations('leads', mutations(majLeads));
  enregistrerMutations('secteurs', mutations(majSecteurs, ajoutSecteurs, suppSecteurs));
  enregistrerMutations('statuts', mutations(majStatuts, ajoutStatuts, suppStatuts));

  return (
    <div className="sdc-root">
      <style>{CSS_APP}</style>
      <App />
    </div>
  );
}
