/**
 * Session d'écriture, côté page.
 *
 * Un seul objet garde le jeton, le joint aux requêtes, ouvre la fenêtre de
 * connexion et relit le retour. Rien d'autre dans l'application ne manipule de
 * jeton.
 *
 * ## Trois contraintes qui expliquent la forme de ce module
 *
 * **Fenêtre séparée.** Google refuse d'afficher son écran de connexion dans une
 * iframe, et l'application vit dans une iframe Softr. D'où `window.open`, et
 * **jamais** `noopener` : c'est par `window.opener` que le résultat revient.
 * Avec `noopener`, la connexion réussit chez Google et la page n'en sait rien.
 *
 * **Pas de cookie.** Dans l'iframe, nos cookies seraient des cookies tiers,
 * donc bloqués. Le jeton voyage en en-tête `Authorization`.
 *
 * **`sessionStorage`, et rien de plus durable.** Rien ne doit survivre à la
 * fermeture de l'onglet : sur un poste partagé, un jeton qui dort ferait de ce
 * poste un administrateur permanent. Comme pour la préférence d'affichage,
 * l'accès est enveloppé — en contexte tiers, le stockage peut être cloisonné ou
 * lever à la simple lecture. Un stockage refusé n'empêche pas de travailler :
 * le jeton reste alors en mémoire, le temps de la page.
 */

const STORAGE_KEY = 'sunlib.demandes.adminToken';
/** Préfixe du fragment utilisé par le repli pleine page. */
const FRAGMENT_KEY = 'admin-auth=';

export interface AdminSession {
  token: string;
  email: string;
  name: string;
  /** Verdict du serveur au moment de la connexion, réévalué à chaque écriture. */
  canWrite: boolean;
}

/** Repli mémoire, quand `sessionStorage` est inaccessible. */
let memorySession: AdminSession | null = null;

function readStored(): AdminSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(session: AdminSession | null): void {
  try {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage cloisonné : la session vit en mémoire et ne survivra pas au
    // rechargement. Acceptable ; lever ici ne le serait pas.
  }
}

export function currentSession(): AdminSession | null {
  return memorySession ?? readStored();
}

function setSession(session: AdminSession | null): void {
  memorySession = session;
  writeStored(session);
  notify();
}

export function signOut(): void {
  setSession(null);
}

/* ------------------------------------------------------------ abonnement */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/* ----------------------------------------------------------------- fetch */

/**
 * `fetch` enveloppé : joint le jeton, et un `auth=1` neutre.
 *
 * Le paramètre sépare la clé de cache d'un éventuel intermédiaire, qui ne varie
 * pas sur `Authorization`. Sans lui, une réponse anonyme mise en cache pourrait
 * être resservie à une requête authentifiée — l'application afficherait
 * « lecture seule » avec une session valide, et se corrigerait d'elle-même à
 * l'expiration du cache. Le serveur pose `Vary: Authorization` de son côté.
 */
export function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = currentSession();
  if (!session) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.token}`);

  let url = input;
  if (input.startsWith('/')) {
    const separator = input.includes('?') ? '&' : '?';
    url = `${input}${separator}auth=1`;
  }

  return fetch(url, { ...init, headers });
}

/* ------------------------------------------------------------- connexion */

export interface AuthConfig {
  /** Vrai si le serveur exige une session pour écrire. */
  googleAuth: boolean;
}

/**
 * Interroge le serveur sur le régime en vigueur.
 *
 * Appelé au montage, sans dépendre d'un email : c'est ce qui rend la porte
 * visible même quand la page ignore qui la lit. Conditionner l'affichage à un
 * email connu laisserait un collaborateur ouvrant l'application hors de Softr
 * sans aucun moyen d'entrer, et sans le moindre indice.
 */
export async function fetchConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch('/api/auth?action=config');
    if (!res.ok) return { googleAuth: false };
    const body = (await res.json()) as AuthConfig;
    return { googleAuth: Boolean(body.googleAuth) };
  } catch {
    // Sans réponse, on suppose le régime historique : afficher une porte qui
    // ne mène nulle part serait plus déroutant que de ne rien afficher.
    return { googleAuth: false };
  }
}

interface PopupMessage {
  source?: string;
  token?: string;
  email?: string;
  name?: string;
  canWrite?: boolean;
}

/**
 * Ouvre la connexion et rend la session obtenue.
 *
 * En cas de fenêtre bloquée, bascule sur une redirection pleine page ; la
 * promesse ne se résout alors jamais, la page étant quittée.
 */
export function signIn(): Promise<AdminSession | null> {
  const start = `/api/auth?action=start&back=${encodeURIComponent(
    window.location.pathname + window.location.search,
  )}`;

  // Pas de `noopener` : le résultat revient par `window.opener`.
  const popup = window.open(`${start}&mode=popup`, 'sunlib-auth', 'width=480,height=640');

  if (!popup) {
    // Fenêtre refusée : repli pleine page, jeton renvoyé dans le fragment.
    window.location.assign(`${start}&mode=redirect`);
    return new Promise(() => {});
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (session: AdminSession | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(watcher);
      if (session) setSession(session);
      resolve(session);
    };

    const onMessage = (event: MessageEvent) => {
      // L'origine est vérifiée avant de regarder le contenu.
      if (event.origin !== window.location.origin) return;
      const data = event.data as PopupMessage;
      if (data?.source !== 'sunlib-admin-auth' || !data.token || !data.email) return;
      finish({
        token: data.token,
        email: data.email,
        name: data.name ?? '',
        canWrite: Boolean(data.canWrite),
      });
    };

    window.addEventListener('message', onMessage);

    // La fenêtre peut être fermée à la main : sans cette veille, la promesse
    // resterait en suspens et le bouton tournerait indéfiniment.
    const watcher = window.setInterval(() => {
      if (popup.closed) finish(null);
    }, 500);
  });
}

/**
 * Récupère une session laissée dans le fragment par le repli pleine page.
 *
 * Le fragment est effacé aussitôt : l'URL peut être copiée, mise en favori ou
 * partagée, et un jeton valide n'a rien à y faire.
 */
export function consumeFragmentSession(): AdminSession | null {
  let hash: string;
  try {
    hash = window.location.hash.replace(/^#/, '');
  } catch {
    return null;
  }
  if (!hash.startsWith(FRAGMENT_KEY)) return null;

  const params = new URLSearchParams(decodeURIComponent(hash.slice(FRAGMENT_KEY.length)));
  const token = params.get('token');
  const email = params.get('email');

  try {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  } catch {
    // Sans History API, le jeton reste visible dans la barre d'adresse. On
    // continue : refuser la session serait pire.
  }

  if (!token || !email) return null;
  const session: AdminSession = {
    token,
    email,
    name: params.get('name') ?? '',
    canWrite: params.get('canWrite') === '1',
  };
  setSession(session);
  return session;
}

/**
 * Revalide la session auprès du serveur.
 *
 * Utile au montage : un jeton peut avoir expiré pendant que l'onglet dormait,
 * ou son porteur avoir été coché « Inactif » entre-temps.
 */
export async function refreshSession(): Promise<AdminSession | null> {
  const session = currentSession();
  if (!session) return null;
  try {
    const res = await fetch('/api/auth?action=me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) return session;
    const body = (await res.json()) as {
      signedIn?: boolean;
      email?: string;
      name?: string;
      canWrite?: boolean;
    };
    if (!body.signedIn) {
      setSession(null);
      return null;
    }
    const refreshed: AdminSession = {
      token: session.token,
      email: body.email ?? session.email,
      name: body.name ?? session.name,
      canWrite: Boolean(body.canWrite),
    };
    setSession(refreshed);
    return refreshed;
  } catch {
    // Hors ligne : on garde la session telle quelle, le serveur tranchera à la
    // première écriture de toute façon.
    return session;
  }
}
