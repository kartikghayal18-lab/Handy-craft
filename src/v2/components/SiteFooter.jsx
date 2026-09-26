import Icon from './Icon.jsx';
import { Link } from '../router.jsx';
import { useStore, whatsappLink } from '../data/store.jsx';
import './site-footer.css';

const LINKS = [
  { label: 'Shop', href: '/shop' },
  { label: 'Shop by Person', href: '/shop-by-person' },
  { label: 'Occasions', href: '/occasions' },
  { label: 'How to Order', href: '/how-to-order' },
];

export default function SiteFooter() {
  const { whatsappNumber, content } = useStore();
  const chat = whatsappLink(whatsappNumber, 'Hi Forever Handy!');
  return (
    <footer className="site-footer">
      <div className="site-footer-inner" data-reveal>
        <div className="footer-top">
          <Link className="footer-brand" to="/" aria-label="Forever Handy home">
            <span className="footer-mark"><img src="/mark.svg" alt="" width="28" height="28" /></span>
            <span>Forever Handy</span>
          </Link>
          <nav className="footer-links" aria-label="Footer">
            {LINKS.map(link => <Link key={link.href} to={link.href}>{link.label}</Link>)}
          </nav>
          {chat && <a className="footer-whatsapp" href={chat} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} />Chat with us on WhatsApp</a>}
        </div>
        <div className="footer-bottom">
          {content.contact.tagline && <p className="footer-tagline">{content.contact.tagline}</p>}
          <p className="footer-copy">© {new Date().getFullYear()} Forever Handy. Made by hand, with love.</p>
        </div>
      </div>
    </footer>
  );
}
