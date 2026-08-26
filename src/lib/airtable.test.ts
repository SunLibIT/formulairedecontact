import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateRecords } from './airtable';

const TABLE = 'tblcgBrFfVCBrczdl';

/** N enregistrements factices, tous porteurs du même champ. */
const makeRecords = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `rec${String(i).padStart(14, '0')}`,
    fields: { fldZjSSAAZVhcVEeH: 'A contacter' },
  }));

const ok = () =>
  new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const boom = () =>
  new Response(JSON.stringify({ error: { message: 'INVALID_REQUEST' } }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  });

/** Corps JSON du n-ième appel à fetch. */
function bodyOf(mock: ReturnType<typeof vi.fn>, call: number) {
  const init = mock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('updateRecords', () => {
  it('découpe en lots de dix, la limite de l’API', async () => {
    const result = await updateRecords(TABLE, makeRecords(25));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock, 0).records).toHaveLength(10);
    expect(bodyOf(fetchMock, 1).records).toHaveLength(10);
    expect(bodyOf(fetchMock, 2).records).toHaveLength(5);
    expect(result.updated).toBe(25);
    expect(result.failed).toEqual([]);
    expect(result.aborted).toBe(false);
  });

  it('n’envoie qu’une requête sous dix enregistrements', async () => {
    await updateRecords(TABLE, makeRecords(4));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne fait aucun appel sur une sélection vide', async () => {
    const result = await updateRecords(TABLE, []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it('n’active jamais typecast : une option inconnue doit échouer, pas être créée', async () => {
    await updateRecords(TABLE, makeRecords(3));
    expect(bodyOf(fetchMock, 0).typecast).toBe(false);
  });

  it('rapporte la progression lot par lot', async () => {
    const seen: Array<[number, number]> = [];
    await updateRecords(TABLE, makeRecords(25), {
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [10, 25],
      [20, 25],
      [25, 25],
    ]);
  });

  it('poursuit après un lot en échec et nomme les identifiants perdus', async () => {
    const records = makeRecords(25);
    // Le deuxième lot est refusé, les deux autres passent.
    fetchMock.mockImplementation(async () =>
      fetchMock.mock.calls.length === 2 ? boom() : ok(),
    );

    const result = await updateRecords(TABLE, records);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.updated).toBe(15);
    expect(result.failed).toHaveLength(10);
    expect(result.failed).toEqual(records.slice(10, 20).map((r) => r.id));
    expect(result.aborted).toBe(false);
  });

  it('s’interrompt entre deux lots quand le signal est déclenché', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      // On annule pendant le premier lot : le suivant ne doit pas partir.
      controller.abort();
      return ok();
    });

    const result = await updateRecords(TABLE, makeRecords(25), {
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.updated).toBe(10);
  });

  it('ne part pas du tout si le signal est déjà déclenché', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await updateRecords(TABLE, makeRecords(25), {
      signal: controller.signal,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.aborted).toBe(true);
    expect(result.updated).toBe(0);
  });

  it('compte une interruption comme telle, pas comme un échec d’écriture', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    const result = await updateRecords(TABLE, makeRecords(12), {
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it('envoie une requête PATCH et demande les champs par identifiant', async () => {
    await updateRecords(TABLE, makeRecords(2));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(String(url)).toContain('returnFieldsByFieldId=true');
    expect(String(url)).toContain(TABLE);
  });
});

describe('forme de l’URL du proxy', () => {
  // Contrat entre le client et la fonction serverless. Il a déjà cassé une
  // fois : la cible passait en segments de chemin et la route attrape-tout de
  // Vercel ne répondait que pour un segment, donc toute mise à jour d'un
  // enregistrement renvoyait 404. La cible passe désormais en paramètres, sur
  // un chemin fixe — ce test l'y maintient.
  it('vise un chemin fixe, la cible en paramètres', async () => {
    await updateRecords(TABLE, makeRecords(1));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://exemple.test');

    expect(url.pathname).toBe('/api/airtable');
    expect(url.searchParams.get('table')).toBe(TABLE);
  });

  it('n’ajoute aucun segment de chemin après /api/airtable', async () => {
    await updateRecords(TABLE, makeRecords(1));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://exemple.test');
    // Deux segments — `/api/airtable/tblXXX/recYYY` — étaient précisément le
    // cas que Vercel ne routait pas.
    expect(url.pathname.split('/').filter(Boolean)).toEqual(['api', 'airtable']);
  });
});
