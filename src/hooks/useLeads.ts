/**
 * Chargement des données Airtable.
 *
 * Corrige trois défauts du code précédent :
 *  - la table RH était rechargée à chaque ouverture de modale (trois appels
 *    concurrents pour la même liste) → elle est désormais mise en cache au
 *    niveau du module, chargée une seule fois par session ;
 *  - l'intervalle de rafraîchissement était recréé à chaque changement
 *    d'onglet et appelait `setLastUpdate` même sans changement → un seul
 *    intervalle, dépendances stables ;
 *  - rien n'annulait une requête en vol, donc une réponse lente pouvait
 *    écraser une réponse plus récente → garde de génération.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listRecords } from '../lib/airtable';
import {
  toContactLead,
  toSolarLead,
  toStaffMember,
  toTerritory,
  type Lead,
  type StaffMember,
  type Territory,
} from '../lib/records';
import { CONTACT, LEAD, STAFF, TABLES, TERRITORY } from '../lib/schema';
import { buildSectorIndex, coverageByStaff } from '../lib/territories';

/** Une heure : les demandes arrivent au compte-gouttes, inutile de marteler l'API. */
const REFRESH_MS = 3_600_000;

/** Champs strictement nécessaires à l'affichage — `Raw JSON` est volontairement exclu. */
const CONTACT_FIELDS = [
  CONTACT.responseId, CONTACT.formId, CONTACT.submittedAt,
  CONTACT.firstName, CONTACT.lastName, CONTACT.email, CONTACT.phone,
  CONTACT.company, CONTACT.requesterType, CONTACT.motive, CONTACT.message,
  CONTACT.address, CONTACT.addressLine2, CONTACT.city, CONTACT.postalCode,
  CONTACT.department, CONTACT.region, CONTACT.country,
  CONTACT.status, CONTACT.priority, CONTACT.partner, CONTACT.assignee,
  CONTACT.notes, CONTACT.gdprConsent,
] as const;

const LEAD_FIELDS = [
  LEAD.firstName, LEAD.lastName, LEAD.email, LEAD.phone, LEAD.customerType,
  LEAD.address, LEAD.city, LEAD.postalCode, LEAD.createdOn,
  LEAD.status, LEAD.priority, LEAD.partner, LEAD.assignee, LEAD.assigneeText,
  LEAD.notes, LEAD.annualConsumption, LEAD.monthlyBill, LEAD.recommendedPower,
  LEAD.gdprConsent,
] as const;

/* ---------------------------------------------------------------- effectif */

let staffCache: Promise<StaffMember[]> | null = null;

function loadStaff(): Promise<StaffMember[]> {
  staffCache ??= listRecords(TABLES.staff, {
    fieldIds: [STAFF.name, STAFF.email, STAFF.group, STAFF.inactive],
  })
    .then((records) => records.map(toStaffMember))
    .catch((err) => {
      staffCache = null; // un échec ne doit pas se figer en cache
      throw err;
    });
  return staffCache;
}

export function useStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let alive = true;
    loadStaff()
      .then((s) => alive && setStaff(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  /** Index identifiant → nom, pour résoudre les champs de liaison. */
  const byId = useMemo(
    () => new Map(staff.map((s) => [s.id, s.name])),
    [staff],
  );

  const active = useMemo(() => staff.filter((s) => s.active), [staff]);

  return { staff, active, byId, error };
}

/* ------------------------------------------------- sectorisation commerciale */

let territoriesCache: Promise<Territory[]> | null = null;

function loadTerritories(): Promise<Territory[]> {
  territoriesCache ??= listRecords(TABLES.territories, {
    fieldIds: [TERRITORY.code, TERRITORY.name, TERRITORY.region, TERRITORY.salesRep, TERRITORY.active],
  })
    .then((records) => records.map(toTerritory))
    .catch((err) => {
      territoriesCache = null;
      throw err;
    });
  return territoriesCache;
}

/**
 * Sectorisation commerciale, mise en cache comme la table RH.
 *
 * 95 lignes qui ne changent que quand l'organisation commerciale change : un
 * chargement par session suffit. Un échec n'est pas remonté à l'appelant —
 * l'interface perd la mise en avant du secteur et reste utilisable, ce qui vaut
 * mieux qu'un bandeau d'erreur sur une information d'appoint.
 *
 * `refresh` vide le cache **avant** de recharger, ce qui n'était pas nécessaire
 * tant que la sectorisation était en lecture seule : depuis que la page
 * d'administration l'édite, un cache figé montrerait indéfiniment l'état
 * d'avant la modification, y compris dans les listes d'assignation.
 */
export function useTerritories() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) territoriesCache = null;
    setLoading(true);
    try {
      const rows = await loadTerritories();
      setTerritories(rows);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadTerritories()
      .then((t) => {
        if (!alive) return;
        setTerritories(t);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sectors = useMemo(() => buildSectorIndex(territories), [territories]);
  const coverage = useMemo(() => coverageByStaff(territories), [territories]);

  const refresh = useCallback(() => load(true), [load]);

  return { territories, sectors, coverage, loading, error, refresh };
}

/* ------------------------------------------------------------------- leads */

export type LeadTable = 'contact' | 'solar';

interface UseLeadsResult {
  leads: Lead[];
  loading: boolean;
  error: string;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
  /** Applique un changement localement, sans attendre un rechargement complet. */
  patchLocal: (id: string, patch: Partial<Lead>) => void;
}

export function useLeads(
  table: LeadTable,
  staffById: Map<string, string>,
): UseLeadsResult {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Incrémenté à chaque chargement : seule la génération courante peut écrire.
  const generation = useRef(0);
  // La correspondance RH arrive après les enregistrements ; on garde les
  // enregistrements bruts pour pouvoir re-normaliser sans rappeler l'API.
  const raw = useRef<Awaited<ReturnType<typeof listRecords>>>([]);

  const normalise = useCallback(
    (records: typeof raw.current) =>
      records.map((r) =>
        table === 'contact' ? toContactLead(r, staffById) : toSolarLead(r, staffById),
      ),
    [table, staffById],
  );

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const records = await listRecords(
        table === 'contact' ? TABLES.contactRequests : TABLES.solarLeads,
        {
          fieldIds: table === 'contact' ? CONTACT_FIELDS : LEAD_FIELDS,
          sortBy: table === 'contact' ? CONTACT.submittedAt : LEAD.createdOn,
          desc: true,
        },
      );
      if (gen !== generation.current) return; // une requête plus récente a pris le relais
      raw.current = records;
      setLeads(normalise(records));
      setLastUpdate(new Date());
    } catch (e) {
      if (gen !== generation.current) return;
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [table, normalise]);

  // Chargement initial + rafraîchissement périodique, une seule fois par table.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Les noms d'assignés apparaissent dès que la table RH est arrivée.
  useEffect(() => {
    if (raw.current.length) setLeads(normalise(raw.current));
  }, [normalise]);

  const patchLocal = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  return { leads, loading, error, lastUpdate, refresh, patchLocal };
}
