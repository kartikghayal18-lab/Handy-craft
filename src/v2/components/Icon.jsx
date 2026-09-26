// Thin, rounded line icons drawn for this site at a 24px grid.
const PATHS = {
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>,
  bag: <><path d="M5.5 8.5h13l-.9 11.5H6.4z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></>,
  menu: <path d="M4 9h16M4 15h16"/>,
  arrow: <path d="M4.5 12h15m-5.5-5.5 5.5 5.5-5.5 5.5"/>,
  truck: <><path d="M2.5 7.5h11v8.5h-11z"/><path d="M13.5 10.5h4l3 3v2.5h-7"/><circle cx="6.5" cy="17.5" r="1.7"/><circle cx="16.5" cy="17.5" r="1.7"/></>,
  gift: <><path d="M4.5 11.5h15V20h-15z"/><path d="M3.5 8h17v3.5h-17zM12 8v12"/><path d="M12 8c-1.2-3-5-3.3-4.8-1.3C7.4 8.2 12 8 12 8Zm0 0c1.2-3 5-3.3 4.8-1.3C16.6 8.2 12 8 12 8Z"/></>,
  card: <><rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M6.5 14.5h4"/></>,
  chat: <><path d="M4.5 19.5l1.2-3.6A7.5 7.5 0 1 1 8.4 18.6z"/><path d="M9.2 9.6c.2 2 2.3 4.2 4.6 4.6l.9-1.1 1.6.8c-.2 1-1.2 1.6-2.1 1.4-2.7-.5-5.3-3-5.6-5.7-.1-.9.5-1.8 1.4-2l.8 1.6z"/></>,
  camera: <><path d="M3.5 8.5h3.8L9 6h6l1.7 2.5h3.8V19h-17z"/><circle cx="12" cy="13.3" r="3.3"/></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></>,
  sparkle: <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5ZM18.5 15.5c.3 1.8 1 2.5 2.5 2.7-1.5.3-2.2 1-2.5 2.8-.3-1.8-1-2.5-2.5-2.8 1.5-.2 2.2-.9 2.5-2.7Z"/>,
  home: <><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15a3 3 0 0 0-6 0v5.5H5.5A1.5 1.5 0 0 1 4 19z"/></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></>,
  magic: <><path d="M10.5 6c.7 4.3 2.4 6 6.7 6.7-4.3.7-6 2.4-6.7 6.8-.7-4.4-2.4-6.1-6.7-6.8 4.3-.7 6-2.4 6.7-6.7Z"/><path d="M18.5 3v5M16 5.5h5"/></>,
  cart: <><path d="M2.5 4h2.6l2.2 11h11l2-8H6.4"/><circle cx="9" cy="19.2" r="1.5"/><circle cx="17" cy="19.2" r="1.5"/></>,
  user: <><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6z"/></>,
  users: <><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.4 2.9-5.2 6-5.2s5.5 1.8 6 5.2z"/><path d="M15.5 5.6a3.2 3.2 0 1 1 1 6.2M17.5 14.6c2 .6 3.2 2.2 3.5 4.9h-3"/></>,
  flower: <><circle cx="12" cy="6.6" r="2.6"/><circle cx="16.4" cy="9.8" r="2.6"/><circle cx="14.7" cy="14.9" r="2.6"/><circle cx="9.3" cy="14.9" r="2.6"/><circle cx="7.6" cy="9.8" r="2.6"/><circle cx="12" cy="11.2" r="1.3"/></>,
  tie: <><path d="M9.5 3.5h5l-1.2 3h-2.6z"/><path d="M10.7 6.5 8.5 16l3.5 4.5 3.5-4.5-2.2-9.5"/></>,
  smile: <><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1.9 2 5.1 2 7 0M9 9.5h.01M15 9.5h.01"/></>,
  baby: <><circle cx="12" cy="12.5" r="7.5"/><path d="M9.3 12h.01M14.7 12h.01M10 15.3c1.2.9 2.8.9 4 0M12 5c-1.6-.4-2.4.6-2 1.6.3.8 1.4.9 2 .2"/></>,
  cake: <><path d="M4.5 20.5h15V14a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z"/><path d="M4.5 16.2c1.3 1 2.5 1 3.8 0s2.5-1 3.7 0 2.5 1 3.7 0 2.5-1 3.8 0M12 12V9"/><path d="M12 4.3c.9 1 1.2 1.8.8 2.5a.9.9 0 0 1-1.6 0c-.4-.7-.1-1.5.8-2.5Z"/></>,
  rings: <><circle cx="9" cy="14.5" r="5"/><circle cx="15" cy="14.5" r="5"/><path d="M7.5 7 9 5l1.5 2"/></>,
  diya: <><path d="M3.5 14h17c-.7 3.3-4.2 5.5-8.5 5.5s-7.8-2.2-8.5-5.5Z"/><path d="M12 4c1.8 2 2.4 3.6 1.6 5-.7 1.2-2.5 1.2-3.2 0-.8-1.4-.2-3 1.6-5Z"/></>,
  rakhi: <><circle cx="12" cy="12" r="3.3"/><path d="M2.5 12h6.2M15.3 12h6.2M12 5.3v3.4M12 15.3v3.4M7.3 7.3l2.4 2.4M16.7 7.3l-2.4 2.4M7.3 16.7l2.4-2.4M16.7 16.7l-2.4-2.4"/></>,
  leaf: <><path d="M5 19.5C4.5 11 9.5 5 19.5 4.5 20 13.5 14 19 5 19.5Z"/><path d="M5 19.5 14 10"/></>,
};

// `filled` fills the closed shapes, used for the selected tab in the bottom bar.
export default function Icon({ name, size = 20, filled = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}
