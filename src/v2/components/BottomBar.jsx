import Icon from './Icon.jsx';
import { Link } from '../router.jsx';
import { useStore } from '../data/store.jsx';
import './bottom-bar.css';

// Phone-only tab bar. Custom leads to How to Order, where personalizing over WhatsApp is explained.
const TABS = [
  { label: 'Home', icon: 'home', href: '/', match: path => path === '/' },
  { label: 'Shop', icon: 'grid', href: '/shop', match: path => path.startsWith('/shop') },
  { label: 'Custom', icon: 'magic', href: '/how-to-order', match: path => path === '/how-to-order' },
  { label: 'Cart', icon: 'cart', cart: true, match: () => false },
  { label: 'Account', icon: 'user', href: '/account', match: path => path === '/account' },
];

export default function BottomBar({ path }) {
  const { cartCount, onCart } = useStore();
  return (
    <nav className="bottom-bar" aria-label="Quick links">
      {TABS.map(tab => {
        const active = tab.match(path);
        const inner = (
          <>
            <span className="bottom-tab-icon">
              <Icon name={tab.icon} size={24} filled={active} />
              {tab.cart && cartCount > 0 && <span className="bottom-tab-badge">{cartCount}</span>}
            </span>
            <span className="bottom-tab-label">{tab.label}</span>
          </>
        );
        return tab.cart
          ? <button key="cart" type="button" className="bottom-tab" onClick={onCart} aria-label={`Cart, ${cartCount} items`}>{inner}</button>
          : <Link key={tab.href} to={tab.href} className={`bottom-tab ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>{inner}</Link>;
      })}
    </nav>
  );
}
