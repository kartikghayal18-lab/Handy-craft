import { useEffect, useState } from 'react';

// Minimal client-side routing: history.pushState plus a popstate listener. Enough for a handful of pages.
const listeners = new Set();

export function navigate(to) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, '', to);
  window.scrollTo(0, 0);
  listeners.forEach(fn => fn());
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, []);
  return path;
}

// An <a> that navigates in-app for same-origin paths, and behaves normally for hashes, new tabs and modified clicks.
export function Link({ to, onClick, ...props }) {
  const handle = event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!to.startsWith('/')) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...props} />;
}
