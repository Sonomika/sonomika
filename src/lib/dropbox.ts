// Minimal Dropbox OAuth (PKCE) + API helper for web builds
// No SDK dependency; uses fetch and stores tokens in localStorage

export type DropboxToken = {
	access_token: string;
	refresh_token?: string;
	expires_at?: number; // epoch ms
};

const STORAGE_KEY = 'vj_dropbox_token_v1';
const STATE_KEY = 'vj_dropbox_oauth_state_v1';
const VERIFIER_KEY = 'vj_dropbox_oauth_verifier_v1';

const DBX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const DBX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const DBX_API_URL = 'https://api.dropboxapi.com/2';

const readEnv = () => {
	const env: any = (import.meta as any).env || {};
	const appKey = env.VITE_DROPBOX_APP_KEY || (typeof window !== 'undefined' && (window as any).__DROPBOX_APP_KEY__) || '';
	const redirectUri = env.VITE_DROPBOX_REDIRECT_URI || (typeof window !== 'undefined' && (window as any).__DROPBOX_REDIRECT_URI__) || (typeof window !== 'undefined' ? window.location.origin : '');
	return { appKey, redirectUri };
};

const base64UrlEncode = (arrayBuffer: ArrayBuffer) => {
	const bytes = new Uint8Array(arrayBuffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const generateRandomString = (length: number) => {
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array).map(b => ('0' + b.toString(16)).slice(-2)).join('');
};

const sha256 = async (plain: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(hash);
};

export const getStoredToken = (): DropboxToken | null => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const storeToken = (token: DropboxToken | null) => {
	if (!token) {
		localStorage.removeItem(STORAGE_KEY);
		return;
	}
	localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
};

export const isAuthed = () => {
	const t = getStoredToken();
	return !!t?.access_token;
};

export const signOutDropbox = () => {
	storeToken(null);
};

export const createAuthUrl = async (): Promise<string> => {
	const { appKey, redirectUri } = readEnv();
	if (!appKey) throw new Error('Dropbox app key is missing. Set VITE_DROPBOX_APP_KEY.');
	if (!redirectUri) throw new Error('Dropbox redirect URI is missing. Set VITE_DROPBOX_REDIRECT_URI.');
	const codeVerifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
	const codeChallenge = await sha256(codeVerifier);
	const state = generateRandomString(16);
	sessionStorage.setItem(VERIFIER_KEY, codeVerifier);
	sessionStorage.setItem(STATE_KEY, state);
	const url = new URL(DBX_AUTH_URL);
	url.searchParams.set('client_id', appKey);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('code_challenge', codeChallenge);
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('token_access_type', 'offline');
	// Request required scopes so the app can list and read files in the app folder
	url.searchParams.set('scope', 'files.metadata.read files.content.read');
	url.searchParams.set('state', state);
	return url.toString();
};

export const beginAuth = async () => {
	const url = await createAuthUrl();
	window.location.assign(url);
};

export const handleRedirectIfPresent = async (): Promise<boolean> => {
	try {
		const url = new URL(window.location.href);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		if (!code || !state) return false;
		// Prevent multiple exchanges on HMR/re-renders for the same code
		const handledKey = 'vj_dropbox_oauth_handled_v1';
		const lastHandledCode = sessionStorage.getItem(handledKey);
		if (lastHandledCode === code) {
			return false;
		}
		sessionStorage.setItem(handledKey, code);
		const savedState = sessionStorage.getItem(STATE_KEY);
		const codeVerifier = sessionStorage.getItem(VERIFIER_KEY) || '';
		if (!savedState || state !== savedState) throw new Error('OAuth state mismatch');
		await exchangeCodeForToken(code, codeVerifier);
		// Clean URL
		url.searchParams.delete('code');
		url.searchParams.delete('state');
		history.replaceState({}, document.title, url.pathname + url.search + url.hash);
		// Clear one-time verifier/state after successful exchange
		sessionStorage.removeItem(STATE_KEY);
		sessionStorage.removeItem(VERIFIER_KEY);
		return true;
	} catch (e) {
		console.error('Dropbox OAuth redirect handling failed:', e);
		return false;
	}
};

const exchangeCodeForToken = async (code: string, codeVerifier: string) => {
	const { appKey, redirectUri } = readEnv();
	const body = new URLSearchParams();
	body.set('code', code);
	body.set('grant_type', 'authorization_code');
	body.set('client_id', appKey);
	body.set('code_verifier', codeVerifier);
	body.set('redirect_uri', redirectUri);
	const res = await fetch(DBX_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});
	if (!res.ok) {
		let details = '';
		try { details = await res.text(); } catch {}
		console.error('Dropbox token exchange error', res.status, details);
		throw new Error('Token exchange failed');
	}
	const data = await res.json();
	const expiresAt = data.expires_in ? Date.now() + Number(data.expires_in) * 1000 - 60_000 : undefined;
	storeToken({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt });
};

const refreshAccessToken = async (): Promise<DropboxToken | null> => {
	const { appKey } = readEnv();
	const current = getStoredToken();
	if (!current?.refresh_token) return null;
	const body = new URLSearchParams();
	body.set('grant_type', 'refresh_token');
	body.set('refresh_token', current.refresh_token);
	body.set('client_id', appKey);
	const res = await fetch(DBX_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});
	if (!res.ok) return null;
	const data = await res.json();
	const updated: DropboxToken = {
		access_token: data.access_token,
		refresh_token: current.refresh_token,
		expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 - 60_000 : current.expires_at,
	};
	storeToken(updated);
	return updated;
};

export const getAccessToken = async (): Promise<string | null> => {
	let t = getStoredToken();
	if (!t?.access_token) return null;
	if (t.expires_at && Date.now() >= t.expires_at) {
		t = (await refreshAccessToken()) || t;
	}
	return t.access_token || null;
};

export type DropboxEntry = {
	name: string;
	path_lower: string;
	path_display: string;
	'.tag': 'file' | 'folder';
	size?: number;
};

export const listFolder = async (path = ''): Promise<{ entries: DropboxEntry[]; cursor?: string; has_more: boolean; }> => {
	const token = await getAccessToken();
	if (!token) throw new Error('Not authenticated with Dropbox');
	const res = await fetch(`${DBX_API_URL}/files/list_folder`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, recursive: false, include_deleted: false })
	});
	if (!res.ok) {
		let details = '';
		try { details = await res.text(); } catch {}
		console.error('Dropbox list_folder error', res.status, details);
		throw new Error('Failed to list folder');
	}
	return res.json();
};

export const listFolderContinue = async (cursor: string) => {
	const token = await getAccessToken();
	if (!token) throw new Error('Not authenticated with Dropbox');
	const res = await fetch(`${DBX_API_URL}/files/list_folder/continue`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ cursor })
	});
	if (!res.ok) throw new Error('Failed to continue listing');
	return res.json();
};

export const getTemporaryLink = async (path: string): Promise<{ link: string; expiresAt?: number }> => {
	const token = await getAccessToken();
	if (!token) throw new Error('Not authenticated with Dropbox');
	const res = await fetch(`${DBX_API_URL}/files/get_temporary_link`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ path })
	});
	if (!res.ok) {
		let details = '';
		try { details = await res.text(); } catch {}
		console.error('Dropbox get_temporary_link error', res.status, details);
		throw new Error('Failed to get temporary link');
	}
	const data = await res.json();
	const expires = data.metadata?.client_modified || data.expires;
	let expiresAt: number | undefined;
	if (typeof expires === 'string') {
		const t = Date.parse(expires);
		if (!Number.isNaN(t)) expiresAt = t;
	}
	return { link: data.link as string, expiresAt };
};


