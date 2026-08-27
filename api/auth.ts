/**
 * Connexion Google — délivrance du jeton de session.
 *
 * Quatre entrées sur un seul chemin, distinguées par `?action=` :
 *
 *   `?action=config`         de quel régime relève-t-on ? (le client en a besoin
 *                            AVANT de savoir qui le lit, pour afficher la porte)
 *   `?action=start&back=…`   redirige vers l'écran Google
 *   `?code=…&state=…`        retour de Google : échange le code, rend le jeton
 *   `?action=me`             identité portée par un jeton, et droit associé
 *
 * ## Pourquoi une fenêtre séparée, et non un formulaire dans la page
 *
 * Google **refuse** d'afficher son écran de connexion dans une iframe
 * (`X-Frame-Options`), et cette application vit dans une iframe Softr. La page
 * ouvre donc une fenêtre, et le résultat revient par `postMessage`. Hors iframe,
 * si le navigateur bloque la fenêtre, on retombe sur une redirection pleine page
 * et le jeton revient dans le **fragment** de l'URL — un fragment ne part vers
 * aucun serveur et n'apparaît dans aucun journal, contrairement à une query.
 *
 * ## Pourquoi pas de cookie
 *
 * Dans l'iframe Softr, nos cookies seraient des cookies tiers, donc bloqués par
 * Safari et Firefox. Le jeton voyage en en-tête `Authorization` et vit en
 * `sessionStorage` côté page.
 *
 * Variables d'environnement (Vercel) :
 *   GOOGLE_CLIENT_ID      client OAuth « Application Web »
 *   GOOGLE_CLIENT_SECRET  son secret
 *   SESSION_SECRET        secret de signature des jetons, inventé par nous
 */
import {
  googleAuthEnabled,
  lookupStaff,
  signPayload,
  signSessionToken,
  STATE_TTL_S,
  TOKEN_TTL_S,
  verifyPayload,
  verifySessionToken,
} from './_lib/auth.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** URI de redirection : celle du déploiement courant, previews comprises. */
function redirectUri(req: Request): string {
  return `${new URL(req.url).origin}/api/auth`;
}

/**
 * Nettoie le paramètre de retour.
 *
 * Doit rester un chemin **interne** : accepter `//autre.site` offrirait une
 * redirection ouverte vers un tiers, avec un jeton valide dedans.
 */
function safeBack(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

interface StatePayload {
  back: string;
  /** `popup` : le résultat repart par postMessage. `redirect` : par le fragment. */
  mode: 'popup' | 'redirect';
  exp: number;
}

/**
 * Page de retour d'une connexion en fenêtre séparée.
 *
 * Le script poste le résultat à l'ouvrante puis se ferme. `window.opener` est la
 * seule voie de retour — c'est précisément pourquoi la page appelante ne doit
 * JAMAIS passer `noopener` à `window.open` : la connexion réussirait chez Google
 * sans que la page en sache rien.
 */
function popupResultPage(payload: object, origin: string): Response {
  const data = inlineJson({ source: 'sunlib-admin-auth', ...payload });
  return html(
    `<!doctype html><meta charset="utf-8"><title>Connexion SunLib</title>` +
      `<body style="font:15px/1.5 Helvetica,Arial,sans-serif;padding:24px;color:#0f172a">` +
      `<p>Connexion terminée. Cette fenêtre peut être fermée.</p>` +
      `<script>(function(){var d=${data};try{` +
      // L'origine cible est explicite : on ne poste jamais vers "*".
      `if(window.opener){window.opener.postMessage(d,${JSON.stringify(origin)});}` +
      `}catch(e){}` +
      `try{window.close();}catch(e){}` +
      `})();</script></body>`,
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  /* ------------------------------------------------------------- config */

  // Appelé au montage de la page : c'est ce qui rend la porte visible même
  // quand la page ignore qui la lit. Ne dépend d'aucun email.
  if (action === 'config') {
    return json({ googleAuth: googleAuthEnabled(), ttlSeconds: TOKEN_TTL_S }, 200);
  }

  if (!googleAuthEnabled()) {
    return json(
      {
        googleAuth: false,
        error:
          'Connexion Google non configurée : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et SESSION_SECRET doivent être posées sur Vercel.',
      },
      503,
    );
  }

  /* ----------------------------------------------------------------- me */

  if (action === 'me') {
    const header = req.headers.get('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const session = token ? verifySessionToken(token) : null;
    if (!session) return json({ googleAuth: true, signedIn: false }, 200);

    // Le droit est relu à chaque fois, jamais lu dans le jeton.
    const staff = await lookupStaff(session.email);
    return json(
      {
        googleAuth: true,
        signedIn: true,
        email: session.email,
        name: staff.name || session.name,
        canWrite: staff.allowed,
        expiresAt: session.exp,
      },
      200,
    );
  }

  /* -------------------------------------------------------------- start */

  if (action === 'start') {
    const state = signPayload(
      {
        back: safeBack(url.searchParams.get('back')),
        mode: url.searchParams.get('mode') === 'redirect' ? 'redirect' : 'popup',
      },
      STATE_TTL_S,
    );

    const target = new URL(GOOGLE_AUTH_URL);
    target.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!.trim());
    target.searchParams.set('redirect_uri', redirectUri(req));
    target.searchParams.set('response_type', 'code');
    target.searchParams.set('scope', 'openid email profile');
    target.searchParams.set('state', state);
    // `select_account` : sur un poste partagé, ne pas reconnecter en silence
    // le dernier compte utilisé.
    target.searchParams.set('prompt', 'select_account');
    target.searchParams.set('include_granted_scopes', 'true');

    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
    });
  }

  /* ------------------------------------------------- retour depuis Google */

  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  if (googleError) {
    return html(
      `<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 Helvetica,Arial,sans-serif;padding:24px">` +
        `<p>Connexion abandonnée (${escapeHtml(googleError)}). Vous pouvez fermer cette fenêtre.</p></body>`,
      400,
    );
  }

  if (!code || !rawState) {
    return json({ error: 'Requête incomplète : action inconnue.' }, 400);
  }

  const state = verifyPayload<StatePayload>(rawState);
  if (!state) {
    return html(
      `<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 Helvetica,Arial,sans-serif;padding:24px">` +
        `<p>Demande expirée ou altérée. Relancez la connexion depuis l'application.</p></body>`,
      400,
    );
  }

  const identity = await exchangeCode(code, redirectUri(req));
  if ('error' in identity) {
    return html(
      `<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 Helvetica,Arial,sans-serif;padding:24px">` +
        `<p>${escapeHtml(identity.error)}</p></body>`,
      502,
    );
  }

  const token = signSessionToken(identity);
  const staff = await lookupStaff(identity.email);

  if (state.mode === 'popup') {
    return popupResultPage(
      {
        token,
        email: identity.email,
        name: staff.name || identity.name,
        canWrite: staff.allowed,
      },
      new URL(req.url).origin,
    );
  }

  // Repli pleine page : le jeton part dans le FRAGMENT, qui n'est jamais
  // transmis au serveur ni journalisé.
  //
  // `safeBack` est réappliqué ici, alors que le `state` est signé et donc non
  // forgeable de l'extérieur. Deux raisons : la protection ne doit pas dépendre
  // du fait qu'un autre point du code a bien nettoyé, et `new URL('//ailleurs',
  // origine)` résout vers un AUTRE hôte — la redirection serait ouverte, avec un
  // jeton valide dans le fragment.
  const back = new URL(safeBack(state.back), new URL(req.url).origin);
  const fragment = new URLSearchParams({
    token,
    email: identity.email,
    name: staff.name || identity.name,
    canWrite: staff.allowed ? '1' : '0',
  });
  back.hash = `admin-auth=${encodeURIComponent(fragment.toString())}`;
  return new Response(null, {
    status: 302,
    headers: { Location: back.toString(), 'Cache-Control': 'no-store' },
  });
}

/**
 * Échange le code contre une identité.
 *
 * La signature de l'`id_token` n'est pas revérifiée : il arrive par un canal
 * serveur-à-serveur ouvert avec notre `client_secret`, donc son intégrité est
 * déjà acquise. En revanche `aud` **est** vérifié — un jeton émis pour un autre
 * client ne doit pas ouvrir de session ici.
 */
async function exchangeCode(
  code: string,
  redirect: string,
): Promise<{ email: string; name: string } | { error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    return { error: `Google injoignable : ${err instanceof Error ? err.message : 'réseau'}` };
  }

  if (!res.ok) {
    return { error: `Google a refusé l'échange du code (${res.status}).` };
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) return { error: 'Réponse Google sans id_token.' };

  const claims = readIdToken(body.id_token);
  if (!claims) return { error: 'id_token illisible.' };
  if (claims.aud !== clientId) {
    return { error: 'id_token émis pour un autre client : refusé.' };
  }
  if (!claims.email) return { error: 'Compte Google sans adresse email.' };
  if (claims.email_verified === false) {
    return { error: 'Adresse Google non vérifiée : connexion refusée.' };
  }

  return { email: claims.email, name: claims.name ?? '' };
}

interface IdTokenClaims {
  aud?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** Lit la charge utile d'un JWT sans vérifier sa signature. Voir `exchangeCode`. */
function readIdToken(idToken: string): IdTokenClaims | null {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Sérialise pour une insertion dans un `<script>` inline.
 *
 * Le nom du compte vient de Google : un compte peut porter n'importe quel nom,
 * `</script><script>…` compris. Sans neutraliser `<`, ce nom s'exécuterait sur
 * notre origine — avec accès au jeton que la page vient de recevoir. On échappe
 * donc `<`, et les deux séparateurs de ligne Unicode qui sont du JSON valide
 * mais coupent un littéral JavaScript.
 *
 * Les deux dernières expressions les désignent par échappement, `/\u2028/`, et
 * non en clair : ces caractères **sont** des terminateurs de ligne pour
 * JavaScript, donc un littéral d'expression régulière qui les contient
 * réellement ne compile pas — TypeScript répond « Unterminated regular
 * expression literal ». C'est la démonstration du danger qu'ils présentent.
 */
function inlineJson(value: object): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
