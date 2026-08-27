import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DELETE as airtableDelete,
  GET as airtableGet,
  PATCH as airtablePatch,
  POST as airtablePost,
} from '../airtable';
import { GET as authGet } from '../auth';
import {
  googleAuthEnabled,
  lookupStaff,
  requireWriter,
  signPayload,
  signSessionToken,
  verifyPayload,
  verifySessionToken,
} from './auth';

/** Identifiants réels, pour que les tests parlent le langage de la base. */
const STAFF_TABLE = 'tblySHLLDvHjk2ktK';
const CONTACT_TABLE = 'tblcgBrFfVCBrczdl';
const RECORD = 'recABCDEFGH123456';
const STAFF_NAME = 'fldELWYPe8utsKKcV';
const STAFF_INACTIVE = 'fldcYvayoR3Dlthwe';

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'client-de-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret-de-test',
  SESSION_SECRET: 'secret-de-session-pour-les-tests',
  AIRTABLE_TOKEN: 'pat-de-test',
};

/**
 * Remplace le réseau.
 *
 * Deux cibles seulement : la table RH (recherche du collaborateur) et l'API
 * Airtable (le PATCH relayé). Toute autre URL fait échouer le test — un appel
 * qu'on n'a pas prévu est une information, pas un détail.
 */
function stubNetwork(options: { staff?: { inactive?: boolean } | null } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);

    if (url.includes(STAFF_TABLE)) {
      const staff = options.staff;
      const records =
        staff === null || staff === undefined
          ? []
          : [
              {
                id: 'recStaff1234567',
                fields: {
                  [STAFF_NAME]: 'Camille Martin',
                  ...(staff.inactive ? { [STAFF_INACTIVE]: true } : {}),
                },
              },
            ];
      return new Response(JSON.stringify({ records }), { status: 200 });
    }

    if (url.startsWith('https://api.airtable.com/')) {
      return new Response(JSON.stringify({ id: RECORD, fields: {} }), { status: 200 });
    }

    throw new Error(`Appel réseau imprévu : ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function patchRequest(headers: Record<string, string> = {}): Request {
  return new Request(
    `https://exemple.test/api/airtable?table=${CONTACT_TABLE}&record=${RECORD}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ fields: { fldZjSSAAZVhcVEeH: 'Qualifié' } }),
    },
  );
}

function enableGoogle() {
  for (const [key, value] of Object.entries(GOOGLE_ENV)) vi.stubEnv(key, value);
}

function disableGoogle() {
  for (const key of Object.keys(GOOGLE_ENV)) vi.stubEnv(key, '');
  vi.stubEnv('AIRTABLE_TOKEN', 'pat-de-test');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('bascule de régime', () => {
  it('reste inactive tant que les trois variables ne sont pas posées', () => {
    // Deux sur trois ne suffisent pas : signer avec un secret vide serait pire
    // qu'un contrôle absent, puisque cela en aurait l'apparence.
    vi.stubEnv('GOOGLE_CLIENT_ID', 'x');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'y');
    vi.stubEnv('SESSION_SECRET', '');
    expect(googleAuthEnabled()).toBe(false);

    vi.stubEnv('SESSION_SECRET', 'z');
    expect(googleAuthEnabled()).toBe(true);
  });
});

describe('jetons', () => {
  beforeEach(enableGoogle);

  it('accepte un jeton qu’il vient de signer', () => {
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    expect(verifySessionToken(token)?.email).toBe('camille@sunlib.fr');
  });

  it('refuse une charge utile modifiée', () => {
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        email: 'intrus@ailleurs.fr',
        name: '',
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
      'utf8',
    ).toString('base64url');
    expect(body).not.toBe(forged);
    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuse un jeton signé avec un autre secret', () => {
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    vi.stubEnv('SESSION_SECRET', 'un-autre-secret');
    expect(verifySessionToken(token)).toBeNull();
  });

  it('refuse un jeton expiré', () => {
    const expired = signPayload({ email: 'camille@sunlib.fr', name: '' }, -1);
    expect(verifyPayload(expired)).toBeNull();
  });

  it('refuse une forme inattendue', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('sans-point')).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
  });
});

describe('lookupStaff', () => {
  beforeEach(enableGoogle);

  it('autorise un collaborateur actif et rend son nom', async () => {
    stubNetwork({ staff: {} });
    await expect(lookupStaff('camille@sunlib.fr')).resolves.toEqual({
      allowed: true,
      name: 'Camille Martin',
    });
  });

  it('refuse un collaborateur coché « Inactif »', async () => {
    stubNetwork({ staff: { inactive: true } });
    const result = await lookupStaff('camille@sunlib.fr');
    expect(result.allowed).toBe(false);
  });

  it('refuse une adresse absente de la table RH', async () => {
    stubNetwork({ staff: null });
    const result = await lookupStaff('inconnu@ailleurs.fr');
    expect(result.allowed).toBe(false);
  });

  it('neutralise l’apostrophe dans la formule de recherche', async () => {
    const { calls } = stubNetwork({ staff: {} });
    await lookupStaff("o'brien@sunlib.fr");
    const formula = decodeURIComponent(calls[0] ?? '');
    // Une apostrophe non échappée fermerait la chaîne de la formule.
    expect(formula).toContain("o\\'brien@sunlib.fr");
  });
});

describe('requireWriter', () => {
  it('laisse tout passer sous le régime historique', async () => {
    disableGoogle();
    const check = await requireWriter(patchRequest());
    expect(check).toEqual({ ok: true, email: '', enforced: false });
  });

  it('refuse sans jeton, même avec un email annoncé', async () => {
    enableGoogle();
    stubNetwork({ staff: {} });
    // C'est tout le trou que l'on ferme : annoncer une adresse ne suffit plus.
    const check = await requireWriter(
      new Request('https://exemple.test/api/airtable?email=direction@sunlib.fr', {
        method: 'PATCH',
      }),
    );
    expect(check.ok).toBe(false);
  });

  it('relit le droit à chaque écriture, sans le lire dans le jeton', async () => {
    enableGoogle();
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });

    // Le même jeton, valide et non expiré, est refusé dès que la table RH le
    // désavoue : retirer quelqu'un doit prendre effet immédiatement.
    stubNetwork({ staff: { inactive: true } });
    const refused = await requireWriter(patchRequest({ Authorization: `Bearer ${token}` }));
    expect(refused.ok).toBe(false);

    vi.unstubAllGlobals();
    stubNetwork({ staff: {} });
    const accepted = await requireWriter(patchRequest({ Authorization: `Bearer ${token}` }));
    expect(accepted.ok).toBe(true);
  });
});

/**
 * Les trois cas exigés, sur l'endpoint d'écriture lui-même — le seul ouvert au
 * navigateur. Toutes les modifications de l'application passent par ce PATCH.
 */
describe('PATCH /api/airtable', () => {
  it('1. régime Google + email annoncé sans jeton → 403', async () => {
    enableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const res = await airtablePatch(
      new Request(
        `https://exemple.test/api/airtable?table=${CONTACT_TABLE}&record=${RECORD}&email=direction@sunlib.fr`,
        { method: 'PATCH', body: '{}' },
      ),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { type?: string } };
    expect(body.error?.type).toBe('AUTH_REQUIRED');
    // Rien n'a été relayé à Airtable : le refus précède l'écriture.
    expect(calls.filter((c) => c.startsWith('https://api.airtable.com/'))).toHaveLength(0);
  });

  it('2. régime Google + jeton valide → passe', async () => {
    enableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    const res = await airtablePatch(patchRequest({ Authorization: `Bearer ${token}` }));
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.startsWith('https://api.airtable.com/'))).toBe(true);
  });

  it('3. aucune variable Google → comportement d’avant, à l’identique', async () => {
    disableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const res = await airtablePatch(patchRequest());
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.startsWith('https://api.airtable.com/'))).toBe(true);
    // Et la table RH n'est même pas interrogée : aucun coût ajouté.
    expect(calls.some((c) => c.includes(STAFF_TABLE))).toBe(false);
  });

  it('refuse un jeton expiré comme un jeton absent', async () => {
    enableGoogle();
    stubNetwork({ staff: {} });
    const stale = signPayload({ email: 'camille@sunlib.fr', name: '' }, -1);
    const res = await airtablePatch(patchRequest({ Authorization: `Bearer ${stale}` }));
    expect(res.status).toBe(403);
  });

  it('garde la lecture publique, et la sépare des caches', async () => {
    enableGoogle();
    stubNetwork({ staff: {} });
    const res = await airtableGet(
      new Request(`https://exemple.test/api/airtable?table=${CONTACT_TABLE}`),
    );
    expect(res.status).toBe(200);
    // Sans jeton, et pourtant servie : la lecture n'est pas protégée.
    expect(res.headers.get('Vary')).toBe('Authorization');
  });
});

/**
 * Retour de Google — les deux pièges de la page de redirection.
 *
 * Le nom du compte vient de Google, où il est librement choisi : il traverse
 * une page HTML puis un `<script>` inline, sur notre origine, avec le jeton à
 * portée. Et le paramètre de retour dirige une redirection.
 */
describe('GET /api/auth — retour de Google', () => {
  /** Forge un id_token : seule la charge utile est lue, jamais la signature. */
  function idToken(claims: object): string {
    const body = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `entete.${body}.signature`;
  }

  function stubGoogle(claims: object) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 });
      }
      if (url.includes(STAFF_TABLE)) {
        return new Response(
          JSON.stringify({ records: [{ id: 'recStaff1234567', fields: { [STAFF_NAME]: 'Camille Martin' } }] }),
          { status: 200 },
        );
      }
      throw new Error(`Appel réseau imprévu : ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('neutralise un nom de compte qui tenterait de fermer le script', async () => {
    enableGoogle();
    stubGoogle({
      aud: GOOGLE_ENV.GOOGLE_CLIENT_ID,
      email: 'camille@sunlib.fr',
      // Un nom Google est libre : celui-ci essaie de sortir du <script>.
      name: '</script><script>alert(document.title)</script>',
      email_verified: true,
    });
    const state = signPayload({ back: '/', mode: 'popup' }, 300);
    const res = await authGet(
      new Request(`https://exemple.test/api/auth?code=abc&state=${encodeURIComponent(state)}`),
    );
    const page = await res.text();
    // Le nom réapparaît, mais échappé : plus aucune balise exécutable.
    expect(page).not.toContain('</script><script>');
    expect(page).toContain('\u003c/script');
  });

  it('refuse un id_token émis pour un autre client', async () => {
    enableGoogle();
    stubGoogle({ aud: 'un-autre-client.apps.googleusercontent.com', email: 'x@sunlib.fr' });
    const state = signPayload({ back: '/', mode: 'popup' }, 300);
    const res = await authGet(
      new Request(`https://exemple.test/api/auth?code=abc&state=${encodeURIComponent(state)}`),
    );
    expect(res.status).toBe(502);
  });

  it('ramène un retour externe sur un chemin interne', async () => {
    enableGoogle();
    stubGoogle({
      aud: GOOGLE_ENV.GOOGLE_CLIENT_ID,
      email: 'camille@sunlib.fr',
      email_verified: true,
    });
    // `//ailleurs.test` est un chemin protocole-relatif : accepté tel quel, il
    // offrirait une redirection vers un tiers avec un jeton valide dedans.
    const state = signPayload({ back: '//ailleurs.test/vol', mode: 'redirect' }, 300);
    const res = await authGet(
      new Request(`https://exemple.test/api/auth?code=abc&state=${encodeURIComponent(state)}`),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(location.origin).toBe('https://exemple.test');
  });

  it('refuse un state altéré', async () => {
    enableGoogle();
    stubGoogle({ aud: GOOGLE_ENV.GOOGLE_CLIENT_ID, email: 'x@sunlib.fr' });
    const res = await authGet(
      new Request('https://exemple.test/api/auth?code=abc&state=nimporte.quoi'),
    );
    expect(res.status).toBe(400);
  });

  it('annonce le régime sans rien exiger', async () => {
    disableGoogle();
    const res = await authGet(new Request('https://exemple.test/api/auth?action=config'));
    expect(res.status).toBe(200);
    // La porte doit pouvoir être interrogée avant toute connexion, et sans email.
    expect(await res.json()).toMatchObject({ googleAuth: false });
  });
});

/**
 * Création et suppression, ouvertes pour la page de sectorisation.
 *
 * Elles comptent autant que le PATCH : une méthode ajoutée sans sa garde est
 * une porte ouverte, et le client ne masque ses boutons que par courtoisie.
 */
describe('POST et DELETE /api/airtable', () => {
  const TERRITORY_TABLE = 'tblw11IuaIggSkNu5';

  function createRequest(headers: Record<string, string> = {}): Request {
    return new Request(`https://exemple.test/api/airtable?table=${TERRITORY_TABLE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ fields: { flds31Paku304s0Z6: '33' } }),
    });
  }

  function deleteRequest(headers: Record<string, string> = {}): Request {
    return new Request(
      `https://exemple.test/api/airtable?table=${TERRITORY_TABLE}&record=${RECORD}`,
      { method: 'DELETE', headers },
    );
  }

  it('refuse une création sans jeton', async () => {
    enableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const res = await airtablePost(createRequest());
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.startsWith('https://api.airtable.com/'))).toHaveLength(0);
  });

  it('refuse une suppression sans jeton', async () => {
    enableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const res = await airtableDelete(deleteRequest());
    expect(res.status).toBe(403);
    // Le point important : rien n'a été supprimé avant le refus.
    expect(calls.filter((c) => c.startsWith('https://api.airtable.com/'))).toHaveLength(0);
  });

  it('accepte création et suppression avec un jeton valide', async () => {
    enableGoogle();
    stubNetwork({ staff: {} });
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    const created = await airtablePost(createRequest({ Authorization: `Bearer ${token}` }));
    expect(created.status).toBe(200);
    const deleted = await airtableDelete(deleteRequest({ Authorization: `Bearer ${token}` }));
    expect(deleted.status).toBe(200);
  });

  it('refuse une suppression demandée par un collaborateur désactivé', async () => {
    enableGoogle();
    stubNetwork({ staff: { inactive: true } });
    const token = signSessionToken({ email: 'olivier@sunlib.fr', name: 'Olivier' });
    const res = await airtableDelete(deleteRequest({ Authorization: `Bearer ${token}` }));
    expect(res.status).toBe(403);
  });

  it('laisse tout passer sous le régime historique', async () => {
    disableGoogle();
    const { calls } = stubNetwork({ staff: {} });
    const res = await airtablePost(createRequest());
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.startsWith('https://api.airtable.com/'))).toBe(true);
  });

  it('refuse une table hors périmètre, jeton valide ou non', async () => {
    enableGoogle();
    stubNetwork({ staff: {} });
    const token = signSessionToken({ email: 'camille@sunlib.fr', name: 'Camille' });
    const res = await airtableDelete(
      new Request(
        `https://exemple.test/api/airtable?table=tblINCONNUE12345&record=${RECORD}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      ),
    );
    // Une session valide n'élargit pas le périmètre des tables joignables.
    expect(res.status).toBe(403);
  });
});
