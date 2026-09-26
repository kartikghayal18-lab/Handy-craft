import Icon from './Icon.jsx';
import { Ornament } from './ShopByCategory.jsx';
import { Link } from '../router.jsx';
import { useStore, whatsappLink } from '../data/store.jsx';
import './how-to-order.css';

// Icons and small notes for each step, in order; the words come from Admin → Website Content.
const STEP_LOOK = [
  { icon: 'bag', note: { icon: 'heart', label: 'Pick as many as you like' } },
  { icon: 'card', note: { icon: 'lock', label: 'Safe, secure payment' } },
  { icon: 'chat', note: { icon: 'camera', label: 'Send photos & details' } },
  { icon: 'sparkle', note: { icon: 'heart', label: 'Made by hand for you' } },
  { icon: 'truck', note: { icon: 'heart', label: 'Delivered across India' } },
];

/**
 * How to Order: three steps from cart to a personalized gift.
 * Under the homepage sections (`embedded`) it is a section; on /how-to-order it is the page.
 */
export default function HowToOrder({ embedded = false }) {
  const Heading = embedded ? 'h2' : 'h1';
  const { content, whatsappNumber } = useStore();
  const copy = content.how_to_order;
  const STEPS = copy.steps.map((step, i) => ({ ...STEP_LOOK[i % STEP_LOOK.length], ...step }));
  const chat = whatsappLink(whatsappNumber, 'Hi Forever Handy! I would like to personalize my order.');

  return (
    <section className={`order ${embedded ? 'is-embedded' : ''}`} aria-labelledby="order-title" id="how-to-order">
      <div className="order-inner">
        <header className="order-header" data-reveal>
          <p className="eyebrow">{copy.eyebrow}</p>
          <Heading id="order-title">{copy.title} <em>{copy.title_accent}</em></Heading>
          <Ornament />
          {copy.lede && <p className="order-lede">{copy.lede}</p>}
        </header>

        <ol className="order-steps">
          {STEPS.map((step, i) => (
            <li className="order-step" key={step.title} data-reveal style={{ '--reveal-delay': `${i * 140}ms` }}>
              <div className="order-step-icon">
                <Icon name={step.icon} size={34} />
                <span className="order-step-number" aria-hidden="true">{i + 1}</span>
              </div>
              <p className="order-step-label" aria-hidden="true">Step {i + 1}</p>
              <h3>{step.title}</h3>
              {step.text && <p className="order-step-text">{step.text}</p>}
              <p className="order-step-note"><Icon name={step.note.icon} size={16} />{step.note.label}</p>
              {i < STEPS.length - 1 && <span className="order-step-arrow" aria-hidden="true"><Icon name="arrow" size={22} /></span>}
            </li>
          ))}
        </ol>

        <div className="order-cta" data-reveal>
          <h3>{copy.cta_title} <em>{copy.cta_accent}</em></h3>
          <p className="order-promise"><Icon name="sparkle" size={18} />Every piece is made by hand after we receive your details, so it is truly yours.</p>
          <div className="order-actions">
            <Link className="button button-primary" to="/shop">{copy.cta_label} <Icon name="arrow" size={18} /></Link>
            {chat && <a className="button button-quiet" href={chat} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} />Chat on WhatsApp</a>}
          </div>
        </div>
      </div>
    </section>
  );
}
