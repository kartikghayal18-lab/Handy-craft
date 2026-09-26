import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Link, navigate } from '../router.jsx';
import { useStore } from '../data/store.jsx';
import './site-nav.css';

const LINKS = [
  { label: 'Gifts', href: '/shop' },
  { label: 'Shop by Person', href: '/shop-by-person' },
  { label: 'Occasions', href: '/occasions' },
  { label: 'How to Order', href: '/how-to-order' },
];

export default function SiteNav({ path = '/' }) {
  const { cartCount, onCart } = useStore();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`site-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="site-nav-inner">
        <button className="nav-icon nav-menu" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><Icon name="menu" /></button>
        <Link className="brand" to="/" aria-label="Forever Handy home"><img src="/mark.svg" alt="" width="30" height="30" /><span>Forever Handy</span></Link>
        <nav className="nav-links" aria-label="Primary">{LINKS.map(link => <Link key={link.label} to={link.href} aria-current={path === link.href ? 'page' : undefined}>{link.label}</Link>)}</nav>
        <div className="nav-actions">
          <button className="nav-icon nav-search" aria-label="Search gifts" onClick={() => navigate('/gifts?search=1')}><Icon name="search" /></button>
          <button className="nav-icon nav-bag" aria-label={`Open cart, ${cartCount} items`} onClick={onCart}><Icon name="bag" /><span>{cartCount}</span></button>
        </div>
      </div>
      {menuOpen && <nav className="nav-sheet" aria-label="Menu">{LINKS.map(link => <Link key={link.label} to={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}</nav>}
    </header>
  );
}
