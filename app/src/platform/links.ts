import { Capacitor } from '@capacitor/core';

export const PUBLIC_WEB_URL = 'https://camilleclipet.github.io/printpak-app/';
export const SUPPORT_EMAIL = 'support.keepitsimple.dev@gmail.com';

/** Always the public site: the native apps open these in the system browser
 *  (Capacitor sends navigation to other hosts there), and the store listings
 *  link to the same pages. */
export const PRIVACY_URL = `${PUBLIC_WEB_URL}privacy.html`;
export const SUPPORT_URL = `${PUBLIC_WEB_URL}support.html`;
export const LICENSES_URL = `${PUBLIC_WEB_URL}licenses.html`;

/** On the web, open in a new tab so the app stays open. In the apps, a plain
 *  link is what makes Capacitor hand it to the system browser. */
export const externalLinkTarget = Capacitor.isNativePlatform() ? undefined : '_blank';
