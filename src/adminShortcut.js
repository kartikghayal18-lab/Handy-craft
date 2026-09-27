/**
 * Keyboard shortcut to the admin panel: ⌘⇧O on macOS, Ctrl+Shift+O on Windows and Linux.
 * Ignored while typing in a field. It only opens /admin; once the admin is connected to the real
 * store, signing in is still required there.
 */
const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const isMac = /mac|iphone|ipad|ipod/i.test(platform);
const typing = el => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

document.addEventListener('keydown', event => {
  const letterO = event.code === 'KeyO' || String(event.key).toLowerCase() === 'o';
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!letterO || !modifier || !event.shiftKey || event.altKey || event.repeat) return;
  if (typing(event.target) || typing(document.activeElement)) return;
  event.preventDefault();
  window.location.assign('/admin/dashboard');
}, true);

/**
 * Touch equivalent for phones: tap the "Forever Handy" brand in the header 5 times within 3 seconds.
 * Earlier taps behave normally (go home); the 5th opens /admin, where sign-in is still required.
 */
const TAPS_NEEDED = 5;
const TAP_WINDOW_MS = 3000;
let taps = [];

document.addEventListener('click', event => {
  const brand = event.target.closest?.('.brand');
  if (!brand) return;
  const now = Date.now();
  taps = taps.filter(time => now - time < TAP_WINDOW_MS);
  taps.push(now);
  if (taps.length < TAPS_NEEDED) return;
  taps = [];
  event.preventDefault();
  event.stopPropagation();
  window.location.assign('/admin/dashboard');
}, true);
