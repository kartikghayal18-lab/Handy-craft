import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';

/**
 * Everything the storefront pages read: live products (loaded by the shop in main.jsx, with its
 * cart and checkout), the category tree, the website text the admin edits, and the business
 * WhatsApp number (the same one checkout uses, from /api/config/whatsapp-number).
 */
const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

// What the pages say until the admin changes it (Admin → Website Content).
export const CONTENT_DEFAULTS = {
  hero: {
    eyebrow: 'Handmade · Personalized · Made with love', line1: 'Turn your', line2: 'moments into', script: 'forever gifts.',
    lede: 'Handcrafted and personalized gifts that keep your special moments close, always.',
    primary_cta: 'Create a gift', secondary_cta: 'Explore collection',
  },
  categories_section: { eyebrow: 'Our collection', title: 'Shop by', title_accent: 'Category', lede: 'Discover handmade and personalized gifts created to make every moment special.' },
  how_to_order: {
    eyebrow: 'Simple & personal', title: 'How to', title_accent: 'Order', lede: 'Three easy steps from our studio to your special moment.',
    steps: [
      { title: 'Add to cart', text: 'Browse our handmade gifts and add the pieces you love to your cart.' },
      { title: 'Buy & pay', text: 'Check out and complete your payment securely to place your order.' },
      { title: 'Customize on WhatsApp', text: 'We redirect you to WhatsApp. Share your photos, names, dates or anything you want us to personalize.' },
    ],
    cta_title: 'Ready to create something', cta_accent: 'special?', cta_label: 'Shop now',
  },
  contact: { tagline: 'Handmade, personalized gifts that keep your special moments close, always.' },
};

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));
const imageUrl = value => {
  if (!value) return '';
  if (/^(https?:|\/)/i.test(value)) return value;
  return supabase?.storage.from('product-images').getPublicUrl(String(value).replace(/^\/+/, '')).data.publicUrl || '';
};
export const whatsappLink = (number, text = '') => (number ? `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null);

export function StoreProvider({ products, catalogState, cartCount, onView, onAdd, onCart, children }) {
  const [categories, setCategories] = useState([]);
  const [content, setContent] = useState(CONTENT_DEFAULTS);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Only live categories are readable by visitors (row-level security: status = true).
    supabase?.from('categories').select('*').eq('status', true)
      .then(({ data }) => { if (!cancelled && data) setCategories(data); });
    // Website text saved in the admin; missing sections keep their defaults.
    supabase?.from('site_content').select('key,value')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setContent(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, ...(data.find(row => row.key === key)?.value || {}) }])));
      });
    fetch('/api/config/whatsapp-number').then(r => r.json())
      .then(data => { if (!cancelled) setWhatsappNumber(String(data?.whatsappNumber || '').replace(/\D/g, '')); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => {
    // Each product with the ids of the categories it sits in.
    const items = products.map(p => ({ ...p, categoryIds: (p.product_categories || []).map(x => x.category?.id || x.category_id).filter(Boolean) }));
    const mains = categories.filter(c => !c.parent_id).sort(bySort);
    const subsOf = main => categories.filter(c => c.parent_id === main.id).sort(bySort);
    const productsIn = category => {
      const ids = new Set([category.id, ...categories.filter(c => c.parent_id === category.id).map(c => c.id)]);
      return items.filter(p => p.categoryIds.some(id => ids.has(id)));
    };
    const pictureOf = category => imageUrl(category.image) || productsIn(category)[0]?.image || '/images/categories/gift-sets.webp';
    return { products: items, catalogState, cartCount, onView, onAdd, onCart, content, whatsappNumber, mains, subsOf, productsIn, pictureOf,
      bySlug: slug => categories.find(c => c.slug === slug) };
  }, [products, catalogState, cartCount, onView, onAdd, onCart, categories, content, whatsappNumber]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
