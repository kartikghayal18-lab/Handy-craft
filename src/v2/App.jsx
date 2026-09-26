import './styles/tokens.css';
import './styles/petals.css';
import SiteNav from './components/SiteNav.jsx';
import Hero from './components/Hero.jsx';
import ShopByCategory from './components/ShopByCategory.jsx';
import HowToOrder from './components/HowToOrder.jsx';
import SectionDivider from './components/SectionDivider.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import GiftFinder from './components/GiftFinder.jsx';
import BottomBar from './components/BottomBar.jsx';
import AmbientPetals from './components/AmbientPetals.jsx';
import Icon from './components/Icon.jsx';
import { PetalDefs } from './components/FloweringBranch.jsx';
import { useScrollEffects } from './motion/useScrollEffects.js';
import { Link, usePath } from './router.jsx';
import { StoreProvider, useStore, whatsappLink } from './data/store.jsx';

// Guest checkout: there are no customer accounts, so "Account" explains where orders are followed up.
function AccountPage() {
  const { whatsappNumber } = useStore();
  const chat = whatsappLink(whatsappNumber, 'Hi Forever Handy! I have a question about my order.');
  return (
    <main className="not-built">
      <p className="eyebrow">Your account</p>
      <h1>No account needed.</h1>
      <p style={{ maxWidth: 440, margin: 0, color: 'var(--ink-soft)', lineHeight: 1.6 }}>Check out as a guest. Your order confirmation and updates come by email, and we personalize your gift with you on WhatsApp.</p>
      {chat && <a className="button button-primary" href={chat} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} />Ask about an order</a>}
      <Link className="button button-quiet" to="/shop">Browse gifts</Link>
    </main>
  );
}

function NotFound() {
  return (
    <main className="not-built">
      <p className="eyebrow">Page not found</p>
      <h1>This page has wandered off.</h1>
      <Link className="button button-quiet" to="/shop">Back to the shop</Link>
    </main>
  );
}

function Pages() {
  const path = usePath();
  const cleanPath = path.replace(/\/+$/, '') || '/';
  useScrollEffects(cleanPath);
  const finder = slug => <main><GiftFinder key={`${slug}${window.location.search}`} slug={slug} /></main>;
  let page;
  if (cleanPath === '/') page = <main id="top"><Hero /><ShopByCategory embedded /><SectionDivider /><HowToOrder embedded /></main>;
  else if (cleanPath === '/shop' || cleanPath === '/categories') page = <main><ShopByCategory /></main>;
  else if (cleanPath === '/gifts') page = finder('all');
  else if (cleanPath === '/shop-by-person') page = finder('shop-by-person');
  else if (cleanPath === '/occasions') page = finder('occasions');
  else if (cleanPath.startsWith('/shop/')) page = finder(decodeURIComponent(cleanPath.slice(6)));
  else if (cleanPath === '/how-to-order') page = <main><HowToOrder /></main>;
  else if (cleanPath === '/account') page = <AccountPage />;
  else page = <NotFound />;

  return (
    <>
      {/* Petal colours, shared by every petal and blossom on every page */}
      <PetalDefs />
      <SiteNav path={cleanPath} />
      {page}
      <SiteFooter />
      <AmbientPetals quietTop={cleanPath === '/'} />
      <BottomBar path={cleanPath} />
    </>
  );
}

/**
 * The storefront pages. The shop (src/main.jsx) owns the catalogue, the cart, the product popup and
 * checkout, and passes them in: `onView` opens a product, `onAdd` adds to the cart, `onCart` opens the bag.
 */
export default function Storefront(props) {
  return <StoreProvider {...props}><Pages /></StoreProvider>;
}
