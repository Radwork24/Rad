import type { UserProfile } from '../services/userService';

const COOKIE_NAME = 'rad_user_session';
const ONE_YEAR_DAYS = 365;

/**
 * Sets a persistent cookie for the logged-in user profile valid for 1 year.
 * Works seamlessly on Vercel or any hosted domain across browser restarts.
 */
export function setAuthCookie(user: UserProfile, days: number = ONE_YEAR_DAYS): void {
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    const encoded = encodeURIComponent(JSON.stringify(user));
    document.cookie = `${COOKIE_NAME}=${encoded}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('Could not set auth cookie:', e);
  }
}

/**
 * Retrieves the user profile from the persistent cookie if present.
 */
export function getAuthCookie(): UserProfile | null {
  try {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
    if (match && match[1]) {
      return JSON.parse(decodeURIComponent(match[1])) as UserProfile;
    }
  } catch (e) {
    console.warn('Could not parse auth cookie:', e);
  }
  return null;
}

/**
 * Clears the user session cookie upon explicit logout.
 */
export function clearAuthCookie(): void {
  try {
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('Could not clear auth cookie:', e);
  }
}
