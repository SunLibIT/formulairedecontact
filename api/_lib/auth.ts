/**
 * Droit d'écrire — point de passage unique.
 *
 * L'application est publique : le domaine `.vercel.app` répond à tout le monde
 * (Deployment Protection doit rester désactivée, sinon l'iframe Softr et le
 * webhook Typeform cessent de fonctionner). Jusqu'ici, le droit de modifier se
 * décidait sur un email **déclaré** dans l'URL — `?email=…`, que Softr injecte.
 * Il suffisait d'ouvrir l'application hors de Softr en écrivant l'adresse d'un
 * collaborateur pour obtenir tous les boutons.
 *
 * Désormais l'email se **prouve** : écrire exige un jeton de session délivré
 * après une véritable connexion Google. La lecture, elle, reste publique et
 * n'est pas touchée.
 *
 * ## Le jeton dit QUI, jamais QUOI
 *
 * Il ne porte aucune permission, seulement une identité. Le droit est relu dans
 * la table RH **à chaque écriture**. Cocher « Inactif » sur un départ ferme
 * l'accès dans la seconde, sans attendre l'expiration du jeton.
 *
 * ## Bascule de régime
 *
 * Tant que `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `SESSION_SECRET` ne
 * sont pas tous les trois définis, `requireWriter` laisse tout passer et
 * l'application se comporte exactement comme avant. C'est ce qui permet de
 * déployer ce code avant d'avoir créé le client Google, sans fenêtre pendant
 * laquelle plus personne ne pourrait rien modifier.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
// Les extensions `.js` sont obligatoires côté `api/` : Vercel compile en ESM,
// et Node en ESM ne résout pas les extensions implicitement.
import { FIELD_NAMES, STAFF, TABLES } from '../../src/lib/schema.js';

/** Huit heures : une journée de travail, pas davantage. */
export const TOKEN_TTL_S = 8 * 60 * 60;
/** Le `state` OAuth ne sert qu'à un aller-retour, il expire vite. */
export const STATE_TTL_S = 5 * 60;

export interface Identity {
  email: string;
  name: string;
}

export interface TokenPayload extends Identity {
  /** Expiration, en secondes epoch. */
  exp: number;
}

/**
 * Vrai si le régime Google est armé.
 *
 * Les trois variables sont exigées ensemble : avec un client Google mais sans
 * secret de session, on signerait avec une chaîne vide — pire qu'une absence de
 * contrôle, parce que cela en aurait l'apparence.
 */
export function googleAuthEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.SESSION_SECRET?.trim(),
  );
}

function sessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() ?? '';
}

/* -------------------------------------------------------------- base64url */

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/* -------------------------------------------------------------- signature */

function sign(body: string): string {
  return createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}

/** Comparaison à temps constant, longueurs comprises. */
function sameSignature(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Signe une charge utile. Format `<payload>.<signature>`, tout en base64url.
 *
 * Aucune session n'est stockée en base : le jeton signé se suffit, et son
 * expiration voyage avec lui.
 */
export function signPayload(payload: object, ttlSeconds: number): string {
  const body = encode(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  );
  return `${body}.${sign(body)}`;
}

/** Rend la charge utile si la signature et l'expiration tiennent, sinon `null`. */
export function verifyPayload<T extends { exp: number }>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  if (!sameSignature(signature, sign(body))) return null;

  try {
    const payload = JSON.parse(decode(body)) as T;
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signSessionToken(identity: Identity): string {
  return signPayload(identity, TOKEN_TTL_S);
}

export function verifySessionToken(token: string): TokenPayload | null {
  return verifyPayload<TokenPayload>(token);
}

/* ----------------------------------------------------------- droit d'écrire */

export interface StaffLookup {
  /** Le collaborateur existe dans RH et n'est pas désactivé. */
  allowed: boolean;
  /** Nom tel qu'il figure dans RH, pour l'afficher plutôt que l'email. */
  name: string;
}

/**
 * Cherche l'email dans la table RH.
 *
 * La règle retenue : **tout collaborateur actif peut écrire**. L'outil sert au
 * suivi commercial, et le restreindre aux seuls groupes Direction et Service
 * client retirerait « M'assigner » aux commerciaux, qui en sont les premiers
 * utilisateurs. Le gain reste entier : l'identité est prouvée au lieu d'être
 * déclarée, et un départ coché « Inactif » perd l'accès immédiatement.
 *
 * `filterByFormula` est le seul endroit du code qui désigne un champ par son
 * NOM — l'API n'accepte pas les identifiants ici. D'où `FIELD_NAMES`.
 */
export async function lookupStaff(email: string): Promise<StaffLookup> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return { allowed: false, name: '' };

  const baseId = process.env.AIRTABLE_BASE_ID ?? 'appYjCP9BUY8Zj5Ni';
  const params = new URLSearchParams({
    pageSize: '1',
    returnFieldsByFieldId: 'true',
    // L'apostrophe est le seul caractère à neutraliser dans une chaîne de
    // formule Airtable ; une adresse email peut légalement en contenir.
    filterByFormula: `LOWER({${FIELD_NAMES.staffEmail}}) = '${normalised.replace(/'/g, "\\'")}'`,
  });

  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLES.staff}?${params}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN ?? ''}` },
  });
  if (!res.ok) return { allowed: false, name: '' };

  const body = (await res.json()) as {
    records?: Array<{ fields?: Record<string, unknown> }>;
  };
  const record = body.records?.[0];
  if (!record) return { allowed: false, name: '' };

  const fields = record.fields ?? {};
  // Une case jamais cochée est absente de la réponse : son absence vaut actif.
  const inactive = fields[STAFF.inactive] === true;
  const rawName = fields[STAFF.name];
  return { allowed: !inactive, name: typeof rawName === 'string' ? rawName : '' };
}

export type WriteCheck =
  | { ok: true; email: string; enforced: boolean }
  | { ok: false; status: number; message: string };

/**
 * La vérification que **tout** endpoint d'écriture doit appeler.
 *
 * Renvoie un verdict plutôt qu'une `Response` : l'appelant garde la main sur le
 * format de son erreur, qui n'est pas le même d'un endpoint à l'autre.
 */
export async function requireWriter(req: Request): Promise<WriteCheck> {
  // Régime historique : rien n'est exigé, exactement comme avant.
  if (!googleAuthEnabled()) return { ok: true, email: '', enforced: false };

  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return {
      ok: false,
      status: 403,
      message: 'Connexion requise pour modifier : utilisez « Activer la modification ».',
    };
  }

  const session = verifySessionToken(token);
  if (!session) {
    return { ok: false, status: 403, message: 'Session expirée ou invalide. Reconnectez-vous.' };
  }

  // Le droit est relu ici, à chaque écriture, et jamais lu dans le jeton.
  const staff = await lookupStaff(session.email);
  if (!staff.allowed) {
    return {
      ok: false,
      status: 403,
      message: `${session.email} n'est pas un collaborateur actif : modification refusée.`,
    };
  }

  return { ok: true, email: session.email, enforced: true };
}
