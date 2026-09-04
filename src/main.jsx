import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './admin/AdminApp';
import './styles.css';
import './foundation.css';
import './components/memory-visuals.css';
import './hero.css';
import { EditorialImageBlock, GiftTag, PaperNote, PhotoStack, PhotoStrip, PolaroidPhoto, TapeSticker } from './components/MemoryVisuals';
import './homepage.css';
import './scroll-effects.css';
import './product-experience.css';
import './categories.css';
import './qa.css';
import './mobile-storefront.css';
import { getProducts } from './lib/supabase/products';
import { createOrder } from './lib/supabase/orders';
import { requireSupabase, supabase } from './lib/supabase/client';

const categories = ['Birthday', 'Anniversary', 'Love', 'Friendship', 'Raksha Bandhan', 'Best Friend', 'Just Because', 'Custom'];
const rupee = (amount) => `₹${amount.toLocaleString('en-IN')}`;
const FALLBACK_PRODUCT_IMAGE = '/images/memory-kraft-collection.png';
const PRODUCT_IMAGE_BUCKET = 'product-images';

// Normalizes whatever a product's image field actually holds into a usable <img> src.
// Handles: a full http(s) URL (returned as-is, never re-resolved), a bucket-relative
// storage path (resolved via supabase.storage.getPublicUrl), a JSON-stringified array
// of paths/URLs, a real array of paths/URLs/{public_url|storage_path} objects, or a
// single {public_url|storage_path} object. Returns null when nothing usable is found.
function resolveImageUrl(value) {
  if (value == null) return null;
  if (Array.isArray(value)) { for (const entry of value) { const resolved = resolveImageUrl(entry); if (resolved) return resolved; } return null; }
  if (typeof value === 'object') return resolveImageUrl(value.public_url || value.publicUrl || value.url || value.storage_path || value.path || null);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed; // already a complete URL — do not call getPublicUrl again
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) { try { return resolveImageUrl(JSON.parse(trimmed)); } catch (_) { /* not JSON — fall through, treat as a plain path */ } }
  if (!supabase) return null;
  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(trimmed.replace(/^\/+/, ''));
  return data?.publicUrl || null;
}

// Every resolvable image for a product, in order (main_image first, then product_images
// by position), de-duplicated. Falls back to the generic collection image if none resolve.
function productImageList(product) {
  const gallery = Array.isArray(product.product_images) ? [...product.product_images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
  const raw = [product.main_image, ...gallery.map(image => image?.public_url || image?.storage_path)];
  const resolved = raw.map(resolveImageUrl).filter(Boolean);
  return [...new Set(resolved)];
}

const toStorefrontProduct = product => {
  const images = productImageList(product);
  if (import.meta.env.DEV) console.debug('[image-debug] product', product.id, product.name, '-> main_image:', product.main_image, '| product_images:', product.product_images, '| resolved:', images);
  return { ...product, price: Number(product.sale_price ?? product.price), regularPrice: Number(product.price), type: product.short_description || product.description || 'Personalized gift', badge: product.personalizable ? 'Personalizable' : null, categories: product.product_categories?.map(item=>item.category?.name).filter(Boolean)||[], art: 'bloom', for: [], image: images[0] || FALLBACK_PRODUCT_IMAGE, gallery: images.length ? images : [FALLBACK_PRODUCT_IMAGE] };
};

function Icon({ name, size = 20 }) {
  const paths = { search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>, bag: <><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>, heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>, menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>, home: <path d="m3 11 9-8 9 8v9H3z"/>, compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 5.4-4.6 1.6 2.2-5.4z"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, close: <path d="M6 6l12 12M18 6 6 18"/>, arrow: <path d="M5 12h14m-6-6 6 6-6 6"/> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ProductArt({ kind, large = false, image }) { return <div className={`product-art ${kind} ${large ? 'large' : ''}`} aria-label="Photograph of a handmade Memory Kraft gift" role="img"><img src={image || '/images/memory-kraft-collection.png'} alt=""/></div>; }

function ProductCard({ product, onView, onAdd, favourite, onFavourite, buttonLabel = 'Add to bag' }) { const discount=product.regularPrice>product.price?Math.round((1-product.price/product.regularPrice)*100):0; const secondImage = product.gallery?.find(url=>url && url !== product.image); return <article className="catalog-card"><div className="catalog-image"><button className="catalog-image-link" onClick={() => onView(product)} aria-label={`View ${product.name}`}><img className="catalog-image-primary" src={product.image} alt={product.name} loading="eager" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/images/memory-kraft-collection.png';}}/>{secondImage&&<img className="catalog-image-secondary" src={secondImage} alt="" aria-hidden="true" loading="lazy"/>}</button>{product.badge&&<span className="catalog-badge">{product.badge}</span>}<button className={`catalog-favourite ${favourite?'is-favourite':''}`} onClick={()=>onFavourite(product.id)} aria-label={`${favourite?'Remove':'Save'} ${product.name}`} aria-pressed={favourite}>{favourite?'♥':'♡'}</button></div><div className="catalog-copy">{product.rating&&<p className="catalog-rating">{Number(product.rating).toFixed(1)} <span>★</span>{product.review_count?` · ${product.review_count}`:''}</p>}<p className="catalog-category">{product.categories?.[0]||'Personalized gift'}</p><h3>{product.name}</h3><p className="catalog-description">{product.type}</p><div className="catalog-price"><strong>{rupee(product.price)}</strong>{product.regularPrice>product.price&&<s>{rupee(product.regularPrice)}</s>}{discount>0&&<small>{discount}% off</small>}</div><button className="catalog-add" onClick={() => onAdd(product)}>{buttonLabel} <Icon name="plus" size={15}/></button></div></article> }

function GiftScene() { return <figure className="gift-scene" aria-label="An open handmade memory gift box surrounded by personal photographs, a ribbon and a handwritten note"><div className="gift-main"><img src="/images/memory-kraft-hero.png" alt="Open handmade memory box with printed photographs, ribbon and flowers"/></div><PolaroidPhoto className="polaroid polaroid-one" image="/images/memory-kraft-hero.png" caption="the little things" rotation="-13deg" size="md" depth={4}/><PolaroidPhoto className="polaroid polaroid-two" image="/images/memory-kraft-collection.png" caption="forever, here" rotation="11deg" size="lg" depth={4}/><PolaroidPhoto className="polaroid polaroid-three" image="/images/memory-kraft-hero.png" caption="just us" rotation="9deg" size="sm" depth={3}/><PolaroidPhoto className="polaroid polaroid-four" image="/images/memory-kraft-collection.png" rotation="-9deg" size="sm" depth={2}/><PaperNote className="hero-note" rotation="-5deg">a small box<br/>of <i>everything</i><b>♡</b></PaperNote><div className="hero-ribbon"/><GiftTag className="hero-tag" rotation="15deg">for<br/>you</GiftTag><TapeSticker className="hero-tape"/></figure> }

function OccasionScene({ name, index, onClick, selected }) { const image = index % 2 ? '/images/memory-kraft-collection.png' : '/images/memory-kraft-hero.png'; return <button className={`occasion-scene occasion-${index} ${selected ? 'is-selected' : ''}`} onClick={onClick} aria-pressed={selected}><img src={image} alt=""/><span>{name}</span><small>find a gift <Icon name="arrow" size={13}/></small></button>; }
function BestSellerGallery({ products, onView, onAdd, favourites, onFavourite, occasion, loading, error, retry, searchActive }) { if (!products.length) return <section className="best-sellers section" id="gifts"><div className="section-head"><p className="eyebrow">The favourites</p><h2>{loading ? 'Gathering the collection…' : error ? 'Gifts are temporarily unavailable.' : searchActive ? 'No gifts match that search.' : 'No gifts are available yet.'}</h2>{error&&<><p className="lede">Please check your connection and try again.</p><button className="primary" onClick={retry}>Retry</button></>}</div>{loading&&<CatalogSkeleton/>}</section>; return <section className="best-sellers section" id="gifts" data-scroll-scene><div className="section-head scene-piece"><p className="eyebrow">{occasion ? `Gifts for ${occasion}` : 'The favourites'}</p><h2>{occasion ? `A little something for ${occasion.toLowerCase()}.` : 'Made to make them smile.'}</h2></div><div className="catalog-grid">{products.map(product=><ProductCard key={product.id} product={product} onView={onView} onAdd={onAdd} favourite={favourites.includes(product.id)} onFavourite={onFavourite}/>)}</div></section> }

const categoryTiles = ['Birthday', 'Anniversary', 'Friendship', 'Couple', 'Personalized', 'Just Because', 'For Her', 'For Him'];
const recipientTiles = ['Her', 'Him', 'Partner', 'Best Friend', 'Family', 'Someone Special'];

function CategoryPage({ products, catalogState, retry, count, favourites, onFavourite, onView, onAdd, onCart }) {
  const [query, setQuery] = useState('');
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [activeCategory, setActiveCategory] = useState(() => new URLSearchParams(location.search).get('category') || 'All gifts');
  const [sort, setSort] = useState('featured');
  const searchRef = React.useRef(null);
  const productSectionRef = React.useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const derivedCategories = products.map(product => {
    const value = `${product.name} ${product.type}`.toLowerCase();
    if (value.includes('frame')) return 'Frames';
    if (value.includes('box')) return 'Memory Boxes';
    if (value.includes('card')) return 'Cards';
    return product.personalizable ? 'Personalized' : null;
  }).filter(Boolean);
  const categoryNames = ['All gifts', ...new Set([...products.flatMap(product => product.categories || []), ...derivedCategories])];
  const shownProducts = products.filter(product => {
    if (wishlistOnly && !favourites.includes(product.id)) return false;
    const searchable = [product.name, product.type, ...(product.categories || [])].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const categoryKey = activeCategory.toLowerCase().replace(/s$/, '');
    const matchesCategory = activeCategory === 'All gifts' || searchable.includes(categoryKey) || (activeCategory === 'Personalized' && product.personalizable);
    return matchesQuery && matchesCategory;
  });
  const orderedProducts = [...shownProducts].sort((first, second) => {
    if (sort === 'price-low') return first.price - second.price;
    if (sort === 'price-high') return second.price - first.price;
    if (sort === 'newest') return new Date(second.created_at || 0) - new Date(first.created_at || 0);
    return 0;
  });
  const scrolled = useScrolled(4);
  useDragScroll('.category-shop-rail, .recipient-rail');
  const chooseCategory = name => { setWishlistOnly(false); setQuery(''); setActiveCategory(name); window.setTimeout(() => productSectionRef.current?.scrollIntoView({behavior:'smooth'}), 30); };
  const focusSearch = () => searchRef.current?.focus();
  const showWishlist = () => { setWishlistOnly(true); setQuery(''); setActiveCategory('All gifts'); window.setTimeout(() => productSectionRef.current?.scrollIntoView({behavior:'smooth'}), 30); };
  const explore = () => { setWishlistOnly(false); setQuery(''); setActiveCategory('All gifts'); productSectionRef.current?.scrollIntoView({behavior:'smooth'}); };
  const resetFilters = () => { setQuery(''); setWishlistOnly(false); setActiveCategory('All gifts'); };
  return <div className="category-page">
    <ScrollProgress/>
    <div className="category-offer">Thoughtful gifts, handmade for every celebration</div>
    <header className={`category-header ${scrolled ? 'is-scrolled' : ''}`}><button className="category-menu" aria-label="Open menu" onClick={() => document.querySelector('.category-shop-rail')?.scrollIntoView({behavior:'smooth'})}><Icon name="menu" size={25}/></button><a className="brand" href="/">memory <em>kraft</em></a><div className="category-header-actions"><button aria-label="Search gifts" onClick={focusSearch}><Icon name="search"/></button><button aria-label="View wishlist" onClick={showWishlist}><Icon name="heart"/></button><button className="bag" aria-label="Open cart" onClick={onCart}><Icon name="bag"/><span>{count}</span></button></div></header>
    <main>
      <button className="delivery-row" onClick={focusSearch}><span>⌖</span><span><small>Delivering across India</small>Find a gift for your moment</span><Icon name="arrow" size={16}/></button>
      <div className="category-search-wrap"><Icon name="search" size={21}/><input ref={searchRef} value={query} onChange={event=>{setWishlistOnly(false);setQuery(event.target.value)}} placeholder={`Search “${activeCategory === 'All gifts' ? 'Gifts' : activeCategory}”`} aria-label="Search products"/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><Icon name="close" size={17}/></button>}</div>
      <section className="category-hero"><img src="/images/memory-kraft-hero.png" alt="Handmade personalized Memory Kraft gift"/><div><p className="eyebrow">The gifting edit</p><h1>Memories, wrapped beautifully.</h1><p>Personalized keepsakes for the people who matter.</p><button className="primary" onClick={explore}>Shop now <Icon name="arrow"/></button></div></section>
      <section className="category-section category-quick"><div className="category-title"><div><p className="eyebrow">Browse the collection</p><h2>Shop by category</h2></div><button onClick={explore}>View all</button></div><div className="category-shop-rail">{categoryNames.map((name,index)=>{const match=products.find(product=>name==='All gifts'||[product.name,product.type,...(product.categories||[])].join(' ').toLowerCase().includes(name.toLowerCase().replace(/s$/,'')));return <button className={activeCategory===name?'is-active':''} key={name} onClick={()=>chooseCategory(name)}><img src={match?.image||(index%2?'/images/memory-kraft-collection.png':'/images/memory-kraft-hero.png')} alt=""/><span>{name}</span></button>})}</div></section>
      <section className="category-products category-section" id="category-gifts" ref={productSectionRef} data-scroll-scene><div className="category-title"><div><p className="eyebrow">Explore our favourites</p><h2>{wishlistOnly?'Your saved gifts':query?`Results for “${query}”`:activeCategory}</h2></div>{(query||wishlistOnly||activeCategory!=='All gifts')&&<button onClick={resetFilters}>Clear</button>}</div>{catalogState.loading?<CatalogSkeleton/>:catalogState.error?<div className="category-state"><h3>We couldn’t load the gift collection.</h3><p>Please check your connection and try again.</p><button className="primary" onClick={retry}>Retry</button></div>:shownProducts.length?<><div className="catalog-controls"><span>{shownProducts.length} {shownProducts.length === 1 ? 'gift' : 'gifts'}</span><button type="button" onClick={resetFilters} disabled={!query && !wishlistOnly && activeCategory === 'All gifts'}>Filter {activeCategory !== 'All gifts' ? `· ${activeCategory}` : ''}</button><label>Sort <select value={sort} onChange={event=>setSort(event.target.value)} aria-label="Sort gifts"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div><div className="catalog-grid">{orderedProducts.map(product=><ProductCard key={product.id} product={product} onView={onView} onAdd={onAdd} favourite={favourites.includes(product.id)} onFavourite={onFavourite} buttonLabel="Add to cart"/>)}</div></>:<div className="category-state"><h3>{wishlistOnly?'No saved gifts yet.':'No active gifts match this filter.'}</h3><button className="text-link" onClick={resetFilters}>See all gifts</button></div>}</section>
      <section className="category-section recipient-section"><div className="category-title"><div><p className="eyebrow">Gift by feeling</p><h2>Shop by recipient</h2></div></div><div className="recipient-rail">{recipientTiles.map((name,index)=><button key={name} onClick={()=>{setQuery(name);setActiveCategory('All gifts');window.setTimeout(()=>productSectionRef.current?.scrollIntoView({behavior:'smooth'}),30)}}><img src={index%2?'/images/memory-kraft-hero.png':'/images/memory-kraft-collection.png'} alt=""/><span>{name}</span></button>)}</div></section>
      <section className="category-section theme-section"><div className="category-title"><div><p className="eyebrow">Made for their story</p><h2>Shop by theme</h2></div></div><div className="category-visual-grid">{categoryTiles.map((name,index)=><button key={name} onClick={()=>{setQuery(name);setActiveCategory('All gifts');window.setTimeout(()=>productSectionRef.current?.scrollIntoView({behavior:'smooth'}),30)}}><img src={index%3===1?'/images/memory-kraft-collection.png':'/images/memory-kraft-hero.png'} alt=""/><span>{name}</span></button>)}</div></section>
      <section className="category-editorial"><img src="/images/memory-kraft-collection.png" alt="Memory Kraft keepsake collection"/><div><p className="eyebrow">Made by hand</p><h2>A little gift. A lasting memory.</h2><button className="text-link" onClick={explore}>Explore the collection</button></div></section>
    </main>
    <nav className="category-bottom-nav" aria-label="Store navigation"><a href="/"><Icon name="home"/><span>Home</span></a><a className="active" href="/categories"><Icon name="compass"/><span>Categories</span></a><button onClick={explore}><Icon name="heart"/><span>Gifts</span></button><button className="bag" onClick={onCart}><Icon name="bag"/><span>Cart</span>{count>0&&<b>{count}</b>}</button></nav>
  </div>;
}

const marqueeItems = ['Handcrafted with love', 'Ships across India', 'Free personalization', 'Made to order, never mass produced'];
function Marquee() { return <div className="mk-marquee" aria-hidden="true"><div className="mk-marquee-track">{[...marqueeItems, ...marqueeItems].map((item, index) => <span key={index}>{item}</span>)}</div></div>; }
function TrustStrip() { return <div className="trust-strip"><div><Icon name="heart" size={16}/><span>Handmade to order — <b>not mass produced</b></span></div><div><Icon name="bag" size={16}/><span>Ships <b>across India</b></span></div><div><Icon name="plus" size={16}/><span><b>Free</b> personalization on every gift</span></div><div><Icon name="compass" size={16}/><span>Packed with care, <b>ready to gift</b></span></div></div>; }
function useScrolled(threshold = 12) { const [scrolled, setScrolled] = useState(false); useEffect(() => { const onScroll = () => setScrolled(window.scrollY > threshold); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll); }, [threshold]); return scrolled; }
function ScrollProgress() { const [width, setWidth] = useState(0); useEffect(() => { const onScroll = () => { const doc = document.documentElement; const max = doc.scrollHeight - doc.clientHeight; setWidth(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0); }; onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll); }, []); return <div className="scroll-progress" style={{ width: `${width}%` }}/>; }
function useDragScroll(selector) {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const rails = Array.from(document.querySelectorAll(selector));
    if (!rails.length) return;
    const cleanups = rails.map(el => {
      let dragging = false, moved = false, startX = 0, startScroll = 0;
      const onDown = event => { dragging = true; moved = false; startX = event.pageX; startScroll = el.scrollLeft; el.classList.add('is-dragging'); };
      const onMove = event => { if (!dragging) return; const dx = event.pageX - startX; if (Math.abs(dx) > 4) moved = true; el.scrollLeft = startScroll - dx; };
      const endDrag = () => { dragging = false; el.classList.remove('is-dragging'); };
      const onClickCapture = event => { if (moved) { event.preventDefault(); event.stopPropagation(); } };
      el.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', endDrag);
      el.addEventListener('click', onClickCapture, true);
      return () => { el.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', endDrag); el.removeEventListener('click', onClickCapture, true); };
    });
    return () => cleanups.forEach(fn => fn());
  }, []);
}
function CatalogSkeleton({ count = 8 }) { return <div className="catalog-skeleton" aria-hidden="true">{Array.from({ length: count }).map((_, index) => <div className="sk-card" key={index}><div className="sk-image"/><div className="sk-line"/><div className="sk-line short"/></div>)}</div>; }

function useScrollScenes() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver !== 'function') return;

    const root = document.documentElement;
    const observedScenes = new Set();
    const fallbackTimers = new Map();
    let observer;
    let mutationObserver;
    let scrollFrame = null;

    const revealScene = scene => {
      const fallbackTimer = fallbackTimers.get(scene);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      fallbackTimers.delete(scene);
      scene.classList.remove('is-scroll-pending');
      scene.classList.add('is-visible');
      observer?.unobserve(scene);
    };

    const revealVisibleScenes = () => {
      scrollFrame = null;
      observedScenes.forEach(scene => {
        if (!scene.classList.contains('is-scroll-pending')) return;
        const bounds = scene.getBoundingClientRect();
        if (bounds.top <= window.innerHeight * 0.95 && bounds.bottom >= 0) revealScene(scene);
      });
    };

    const queueVisibilityCheck = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(revealVisibleScenes);
    };

    const observeScene = scene => {
      if (!(scene instanceof Element) || observedScenes.has(scene)) return;
      observedScenes.add(scene);

      const bounds = scene.getBoundingClientRect();
      if (bounds.top <= window.innerHeight * 0.95 && bounds.bottom >= 0) {
        scene.classList.add('is-visible');
        return;
      }

      scene.classList.add('is-scroll-pending');
      try {
        observer.observe(scene);
        fallbackTimers.set(scene, window.setTimeout(() => revealScene(scene), 1500));
      } catch (error) {
        revealScene(scene);
      }
    };

    try {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        const fallbackTimer = fallbackTimers.get(entry.target);
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        fallbackTimers.delete(entry.target);
        if (entry.isIntersecting) revealScene(entry.target);
      }), { threshold: .16, rootMargin: '0px 0px -8% 0px' });

      document.querySelectorAll('[data-scroll-scene]').forEach(observeScene);
      root.classList.add('motion-safe', 'scroll-scenes-ready');

      mutationObserver = new MutationObserver(records => records.forEach(record => {
        if (record.type === 'attributes') {
          observeScene(record.target);
          return;
        }
        record.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches('[data-scroll-scene]')) observeScene(node);
          node.querySelectorAll('[data-scroll-scene]').forEach(observeScene);
        });
      }));
      mutationObserver.observe(document.getElementById('root'), { attributes: true, attributeFilter: ['data-scroll-scene'], childList: true, subtree: true });
      window.addEventListener('scroll', queueVisibilityCheck, { passive: true });
      window.addEventListener('resize', queueVisibilityCheck, { passive: true });
      window.addEventListener('pageshow', queueVisibilityCheck);
      document.addEventListener('visibilitychange', queueVisibilityCheck);
      queueVisibilityCheck();
    } catch (error) {
      observedScenes.forEach(revealScene);
      root.classList.remove('motion-safe', 'scroll-scenes-ready');
    }

    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      fallbackTimers.forEach(timer => window.clearTimeout(timer));
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', queueVisibilityCheck);
      window.removeEventListener('resize', queueVisibilityCheck);
      window.removeEventListener('pageshow', queueVisibilityCheck);
      document.removeEventListener('visibilitychange', queueVisibilityCheck);
      observedScenes.forEach(revealScene);
      root.classList.remove('motion-safe', 'scroll-scenes-ready');
    };
  }, []);
}

function App() {
  const [catalogProducts, setCatalogProducts] = useState([]); const [catalogState,setCatalogState]=useState({loading:true,error:false}); const [favourites,setFavourites]=useState([]); const [cart, setCart] = useState([]); const [selected, setSelected] = useState(null); const [drawer, setDrawer] = useState(false); const [checkout, setCheckout] = useState(false); const [filter, setFilter] = useState('All'); const [selectedOccasion, setSelectedOccasion] = useState(null); const [cartNotice,setCartNotice]=useState(null); const [mobileSearch,setMobileSearch]=useState(''); const [mobileMenuOpen,setMobileMenuOpen]=useState(false); const [wishlistOnly,setWishlistOnly]=useState(false); const [bagBump,setBagBump]=useState(false); const scrolled = useScrolled(); useDragScroll('.occasion-rail, .supporting-gifts, .story-line');
  const count = cart.reduce((n, p) => n + p.quantity, 0); const total = cart.reduce((n, p) => n + p.price * p.quantity, 0);
  const visible = useMemo(() => {
    const searchTerm = mobileSearch.trim().toLowerCase();
    return catalogProducts.filter(product => {
      const matchesPerson = filter === 'All' || product.for.includes(filter);
      const matchesOccasion = !selectedOccasion || product.categories?.some(category => category.toLowerCase() === selectedOccasion.toLowerCase());
      const matchesWishlist = !wishlistOnly || favourites.includes(product.id);
      const searchable = [product.name, product.type, ...(product.categories || [])].filter(Boolean).join(' ').toLowerCase();
      return matchesPerson && matchesOccasion && matchesWishlist && (!searchTerm || searchable.includes(searchTerm));
    });
  }, [filter, catalogProducts, favourites, mobileSearch, selectedOccasion, wishlistOnly]);
  const loadCatalog=async()=>{setCatalogState({loading:true,error:false});try{const items=await getProducts();console.log('[catalog-debug] raw products', items);setCatalogProducts(items.map(toStorefrontProduct));setCatalogState({loading:false,error:false});}catch(error){console.error('[catalog-debug] getProducts() failed', error);setCatalogProducts([]);setCatalogState({loading:false,error:true});}};
  useEffect(() => { loadCatalog(); }, []);
  useEffect(() => {
    const refreshWhenReturning = () => { if (document.visibilityState === 'visible') loadCatalog(); };
    addEventListener('focus', refreshWhenReturning);
    document.addEventListener('visibilitychange', refreshWhenReturning);
    return () => { removeEventListener('focus', refreshWhenReturning); document.removeEventListener('visibilitychange', refreshWhenReturning); };
  }, []);
  const add = (product, customization = null) => { const alreadyInCart=cart.some(item=>item.id===product.id); setCart(items => { const existing = items.find(item => item.id === product.id); return existing ? items.map(item => item.id === product.id ? {...item, quantity: item.quantity + 1, customization: customization || item.customization} : item) : [...items, {...product, quantity: 1, customization}]; }); setCartNotice({name:product.name,alreadyInCart}); setBagBump(true); window.setTimeout(()=>setBagBump(false),450); };
  useEffect(()=>{if(!cartNotice)return;const timer=window.setTimeout(()=>setCartNotice(null),3200);return()=>window.clearTimeout(timer)},[cartNotice]);
  const remove = id => setCart(items => items.filter(item => item.id !== id));
  const changeQuantity = (id, delta) => setCart(items => items.flatMap(item => item.id !== id ? [item] : item.quantity + delta > 0 ? [{...item, quantity: item.quantity + delta}] : []));
  const goProducts = () => document.getElementById('gifts').scrollIntoView({behavior:'smooth'});
  const showMobileWishlist = () => { setWishlistOnly(true); setMobileSearch(''); goProducts(); };
  const mobileCategories = [...new Set(catalogProducts.flatMap(product => product.categories || []))].slice(0, 8);
  const mobileCategoryItems = mobileCategories.length ? mobileCategories : categories;
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
    const heroEl = document.querySelector('.hero'); const scene = heroEl?.querySelector('.gift-scene');
    if (!heroEl || !scene) return;
    let raf = null;
    const onMove = event => {
      const rect = heroEl.getBoundingClientRect();
      const px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      const py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      if (raf) return;
      raf = requestAnimationFrame(() => { scene.style.setProperty('--px', px.toFixed(3)); scene.style.setProperty('--py', py.toFixed(3)); raf = null; });
    };
    const onLeave = () => { scene.style.setProperty('--px', 0); scene.style.setProperty('--py', 0); };
    heroEl.addEventListener('mousemove', onMove);
    heroEl.addEventListener('mouseleave', onLeave);
    return () => { heroEl.removeEventListener('mousemove', onMove); heroEl.removeEventListener('mouseleave', onLeave); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useScrollScenes();
  useEffect(() => { const openAdminLogin = event => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); location.assign('/admin/login'); } }; window.addEventListener('keydown', openAdminLogin); return () => window.removeEventListener('keydown', openAdminLogin); }, []);
  const selectOccasion = occasion => { setSelectedOccasion(occasion); window.setTimeout(goProducts, 220); };
  if (location.pathname === '/categories') return <><CategoryPage products={catalogProducts} catalogState={catalogState} retry={loadCatalog} count={count} favourites={favourites} onFavourite={id=>setFavourites(items=>items.includes(id)?items.filter(item=>item!==id):[...items,id])} onView={setSelected} onAdd={add} onCart={()=>setDrawer(true)}/>{cartNotice&&<div className="cart-toast" role="status"><span>✓</span><div><strong>{cartNotice.alreadyInCart?'Already in your cart':'Added to cart'}</strong><small>{cartNotice.name}</small></div><button onClick={()=>{setCartNotice(null);setDrawer(true)}}>View cart</button></div>}{selected && <ProductModal product={selected} close={() => setSelected(null)} add={customization => { add(selected, customization); setSelected(null); }}/>} {drawer && <CartDrawer cart={cart} total={total} close={() => setDrawer(false)} checkout={()=>{setDrawer(false);setCheckout(true)}} remove={remove} changeQuantity={changeQuantity}/>} {checkout && <Checkout cart={cart} close={()=>setCheckout(false)} complete={()=>{setCart([]);setCheckout(false)}}/>}</>;
  const goSection = id => () => document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
  return <><ScrollProgress/><Marquee/><header className={`topbar ${scrolled ? 'is-scrolled' : ''}`}><a className="brand" href="#top">memory <em>kraft</em></a><nav><button onClick={goProducts}>Gifts</button><button onClick={goSection('discover')}>Shop by Person</button><button onClick={goSection('occasions')}>Occasions</button><button onClick={goSection('story')}>Our story</button></nav><div className="header-actions"><button aria-label="Search gifts" onClick={goProducts}><Icon name="search"/></button><button aria-label="View wishlist" onClick={showMobileWishlist}><Icon name="heart"/></button><button className={`bag ${bagBump ? 'bump' : ''}`} aria-label="Open cart" onClick={() => setDrawer(true)}><Icon name="bag"/><span>{count}</span></button></div></header>
  <header className={`mobile-store-header ${scrolled ? 'is-scrolled' : ''}`}><div className="mobile-header-bar"><button aria-label="Open shop menu" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(open=>!open)}><Icon name="menu"/></button><a className="brand" href="#top">memory <em>kraft</em></a><div><button aria-label="View wishlist" onClick={showMobileWishlist}><Icon name="heart"/></button><button className={`bag ${bagBump ? 'bump' : ''}`} aria-label="Open cart" onClick={() => setDrawer(true)}><Icon name="bag"/><span>{count}</span></button></div></div><div className="mobile-search"><Icon name="search" size={18}/><input value={mobileSearch} onChange={event=>{setWishlistOnly(false);setMobileSearch(event.target.value)}} placeholder="Search gifts, photos, frames…" aria-label="Search gifts"/>{mobileSearch&&<button aria-label="Clear search" onClick={()=>setMobileSearch('')}><Icon name="close" size={16}/></button>}</div><nav className="mobile-category-nav" aria-label="Shop categories">{mobileCategoryItems.map((name,index)=>{const match=catalogProducts.find(product=>product.categories?.includes(name));return <a href={`/categories?category=${encodeURIComponent(name)}`} key={name}><img src={match?.image || (index % 2 ? '/images/memory-kraft-collection.png' : '/images/memory-kraft-hero.png')} alt=""/><span>{name}</span></a>})}</nav>{mobileMenuOpen&&<nav className="mobile-menu-panel" aria-label="Shop menu"><a href="/categories">Shop all gifts</a><button onClick={()=>{setMobileMenuOpen(false);goProducts();}}>Best sellers</button><button onClick={()=>{setMobileMenuOpen(false);document.getElementById('occasions')?.scrollIntoView({behavior:'smooth'});}}>Occasions</button><button onClick={()=>{setMobileMenuOpen(false);document.getElementById('discover')?.scrollIntoView({behavior:'smooth'});}}>Shop by person</button><button onClick={()=>{setMobileMenuOpen(false);document.getElementById('story').scrollIntoView({behavior:'smooth'});}}>Our story</button></nav>}</header>
  <main id="top"><section className="mobile-hero"><img src="/images/memory-kraft-hero.png" alt="Handmade Memory Kraft personalized gift"/><div><p className="eyebrow">Personalized gifting</p><h1>Made from the moments you <i>love.</i></h1><p>Handmade keepsakes for the people who mean everything.</p><button className="primary" onClick={goProducts}>Shop now <Icon name="arrow"/></button></div></section><section className="hero"><div className="hero-copy"><p className="eyebrow">Personalized gifting, made tenderly</p><h1>Make your memories <i>worth keeping.</i></h1><p className="lede">Personalized gifts made from your favourite moments, for the people who mean everything.</p><div className="hero-actions"><button className="primary" onClick={goProducts}>Create a gift <Icon name="arrow"/></button><button className="text-link" onClick={goProducts}>Explore gifts</button></div><p className="shipping">Handmade with care · Ships across India</p></div><GiftScene/></section>
  <TrustStrip/>
  <section className="occasions section" id="occasions" data-scroll-scene><div className="section-head scene-piece"><p className="eyebrow">Gift by feeling</p><h2>Who are you gifting for?</h2></div><div className={`occasion-rail ${selectedOccasion ? 'has-selection' : ''}`}>{mobileCategoryItems.map((category,index) => <OccasionScene key={category} name={category} index={index} selected={selectedOccasion === category} onClick={() => selectOccasion(category)}/>)}</div></section>
  <BestSellerGallery products={mobileSearch || wishlistOnly || selectedOccasion ? visible : catalogProducts} onView={setSelected} onAdd={add} favourites={favourites} onFavourite={id=>setFavourites(items=>items.includes(id)?items.filter(item=>item!==id):[...items,id])} occasion={selectedOccasion} searchActive={Boolean(mobileSearch || wishlistOnly || selectedOccasion)} {...catalogState} retry={loadCatalog}/>
  <section className="how-story memory-story section" id="story" data-scroll-scene><div className="section-head scene-piece"><p className="eyebrow">A little ritual</p><h2>Little moments. Big memories.</h2></div><div className="story-line"><article className="scene-piece"><span>01</span><PolaroidPhoto image="/images/memory-kraft-collection.png" alt="Handmade gift collection" caption="pick a feeling" rotation="-5deg" tape/><h3>Choose your gift</h3><p>Find a piece that feels like them.</p></article><article className="scene-piece"><span>02</span><PaperNote tone="blush" rotation="3deg">your favourite<br/><i>moments</i></PaperNote><h3>Add your memories</h3><p>Share the photos and words that matter.</p></article><article className="scene-piece"><span>03</span><EditorialImageBlock image="/images/memory-kraft-hero.png" alt="Finished personalized memory box" title="made by hand"/><h3>We make it beautiful</h3><p>Carefully packed and ready to hold.</p></article></div></section>
  <section className="photo-to-gift section" data-scroll-scene><div className="photo-gift-copy scene-piece"><p className="eyebrow">Made just once</p><h2>From camera roll to keepsake.</h2><p>Favourite moments become a gift they can hold on to.</p><button className="primary" disabled={!catalogProducts[0]} onClick={() => setSelected(catalogProducts[0])}>Start personalizing <Icon name="arrow"/></button></div><div className="gift-journey"><div className="journey-phone scene-piece"><span>♡</span><small>your photo</small></div><span className="journey-arrow">→</span><PolaroidPhoto className="scene-piece" image="/images/memory-kraft-hero.png" alt="Printed memory photo" caption="printed" rotation="-7deg" size="sm"/><span className="journey-arrow">→</span><div className="journey-box scene-piece"><img src="/images/memory-kraft-collection.png" alt="Personalized finished gift"/><span>keepsake</span></div></div></section>
  <section className="featured-spread section" data-scroll-scene><div className="featured-copy scene-piece"><p className="eyebrow">The memory edit</p><h2>For the person who means everything.</h2><p>A thoughtful spread of photographs, flowers, and small details that say it all.</p><button className="text-link" disabled={!catalogProducts[1]} onClick={() => setSelected(catalogProducts[1])}>Explore the collection</button></div><div className="featured-composition scene-piece"><img src="/images/memory-kraft-hero.png" alt="Memory gift box with flowers and printed photographs"/><PolaroidPhoto image="/images/memory-kraft-collection.png" alt="Gift details" caption="made with love" rotation="8deg" size="sm"/><PaperNote rotation="-4deg">memories<br/><i>inside</i></PaperNote><GiftTag tone="sage">for her</GiftTag><span className="spread-ribbon"/></div></section>
  <section className="discover section" id="discover" data-scroll-scene><p className="eyebrow scene-piece">A little help choosing</p><h2 className="scene-piece">Not sure what to gift?</h2><div className="filter-row">{['All','Her','Him','Best Friend','Sister','Brother','Partner','Someone Special'].map(person => <button key={person} className={filter === person ? 'active' : ''} onClick={() => setFilter(person)}>{person}</button>)}</div><div className="catalog-grid filtered">{visible.map(p => <ProductCard key={p.id} product={p} onView={setSelected} onAdd={add} favourite={favourites.includes(p.id)} onFavourite={id=>setFavourites(items=>items.includes(id)?items.filter(item=>item!==id):[...items,id])}/>)}</div></section>
  <section className="gallery section" data-scroll-scene><div className="section-head scene-piece"><p className="eyebrow">@memory_kraft</p><h2>Made by us. Loved by you.</h2></div><div className="memory-wall"><PolaroidPhoto image="/images/memory-kraft-hero.png" alt="Personalized gift unboxing details" caption="unboxed with love" rotation="-8deg" size="md"/><EditorialImageBlock image="/images/memory-kraft-collection.png" alt="Handmade personalized gifts" eyebrow="a little surprise"/><PaperNote tone="sage" rotation="5deg">kept<br/><i>close</i></PaperNote><EditorialImageBlock image="/images/memory-kraft-hero.png" alt="Memory box and ribbon" title="the details"/><PolaroidPhoto image="/images/memory-kraft-collection.png" alt="Personalized keepsake gift" caption="for her" rotation="7deg" size="sm"/><GiftTag tone="rose" rotation="-9deg">just<br/>because</GiftTag></div><PhotoStrip className="mobile-memory-strip" photos={[{image:'/images/memory-kraft-hero.png',alt:'Memory box photograph',caption:'a little surprise',rotation:'-4deg'},{image:'/images/memory-kraft-collection.png',alt:'Handmade gift collection',caption:'made to keep',rotation:'3deg'},{image:'/images/memory-kraft-hero.png',alt:'Personalized gift detail',caption:'for someone special',rotation:'-2deg'}]}/><button className="text-link instagram">See more on Instagram <Icon name="arrow"/></button></section>
  <section className="final-cta section" data-scroll-scene><div className="final-cta-wrap"><div className="final-copy"><p className="eyebrow">A gift, kept close</p><h2>Give them something they’ll never throw away.</h2><p>Made by hand from the moments that already mean the most.</p><button className="primary" onClick={goProducts}>Create a gift <Icon name="arrow"/></button></div><div className="final-gift-scene"><img src="/images/memory-kraft-hero.png" alt="Complete Memory Kraft gift composition"/><PolaroidPhoto image="/images/memory-kraft-collection.png" alt="A small memory photograph" caption="always" rotation="7deg" size="sm"/><PaperNote rotation="-4deg">for every<br/><i>little moment</i></PaperNote><GiftTag tone="rose">made<br/>with love</GiftTag><span className="final-ribbon"/></div></div></section></main>
  <footer><a className="brand" href="#top">memory <em>kraft</em></a><p>Personalized gifts made from your favourite memories.</p><small>© 2026 Memory Kraft</small></footer>
  <nav className="bottom-nav"><a href="#top"><Icon name="home"/><span>Home</span></a><button onClick={goProducts}><Icon name="compass"/><span>Explore</span></button><button onClick={goProducts}><Icon name="search"/><span>Search</span></button><button onClick={() => setDrawer(true)}><Icon name="bag"/><span>Cart {count ? `(${count})` : ''}</span></button></nav>
  {selected && <ProductModal product={selected} close={() => setSelected(null)} add={customization => { add(selected, customization); setSelected(null); }}/>} {drawer && <CartDrawer cart={cart} total={total} close={() => setDrawer(false)} checkout={()=>{setDrawer(false);setCheckout(true)}} remove={remove} changeQuantity={changeQuantity}/>} {checkout && <Checkout cart={cart} close={()=>setCheckout(false)} complete={()=>{setCart([]);setCheckout(false)}}/>}</>;
}

function ProductModal({product, close, add}) { const [files, setFiles] = useState([]); const [note, setNote] = useState(''); const [galleryIndex, setGalleryIndex] = useState(0); const gallery = product.gallery?.length ? product.gallery : [product.image]; const previews = useMemo(() => files.map(file => ({name:file.name, url:URL.createObjectURL(file)})), [files]); useEffect(() => () => previews.forEach(preview => URL.revokeObjectURL(preview.url)), [previews]); const selectFiles = event => setFiles(Array.from(event.target.files || [])); return <div className="overlay product-overlay" role="dialog" aria-modal="true" aria-label={product.name}><div className="product-modal"><button className="modal-close" onClick={close} aria-label="Close product details"><Icon name="close"/></button><div className="product-gallery"><div className="product-main-image"><img src={gallery[galleryIndex]} alt={`${product.name} product view`}/><span>{product.badge}</span></div><div className="product-gallery-thumbs">{gallery.map((image,index) => <button key={image} className={galleryIndex === index ? 'is-active' : ''} onClick={() => setGalleryIndex(index)} aria-label={`Show product photo ${index + 1}`}><img src={image} alt=""/></button>)}</div><PhotoStack className="product-photo-stack" label="Product detail photographs" photos={[{image:gallery[0],caption:'made to keep',rotation:'-7deg'},{image:gallery[0],rotation:'6deg'}]}/></div><div className="product-details"><p className="eyebrow">Personalized gift</p><h2>{product.name}</h2><strong className="modal-price">{rupee(product.price)}</strong><p className="product-description">{product.type}. Made from your moments, with the details that make it theirs.</p><div className="personalization-panel"><div className="personalization-heading"><div><p className="eyebrow">The personal part</p><h3>Add your memories</h3></div><span>Optional</span></div><p>Choose photos from this device to preview how your memories can become part of the gift.</p><label className="upload upload-zone"><input type="file" accept="image/*" multiple onChange={selectFiles}/><Icon name="plus"/><span><b>Choose photos</b><small>Local preview only — not uploaded until a delivery flow is connected.</small></span></label>{previews.length > 0 && <div className="upload-previews" aria-live="polite">{previews.map((preview,index) => <PolaroidPhoto key={preview.url} image={preview.url} alt={`Selected photo ${index + 1}`} caption={index === 0 ? 'your memory' : undefined} size="sm" rotation={`${index % 2 ? 4 : -4}deg`}/>)}</div>}<div className="preview-placement">{previews[0] ? <><img src={previews[0].url} alt="Selected photo preview inside gift"/><span>your photo, printed</span></> : <><img src={gallery[0]} alt="Example photo placement in a gift"/><span>your photo will appear here</span></>}</div><label className="text-field">A note for them <input value={note} onChange={event => setNote(event.target.value)} placeholder="Write something from the heart"/></label></div><button className="primary full" onClick={() => add({photoCount:files.length, note:note.trim()})}>Add to cart · {rupee(product.price)}</button><p className="delivery">Delivery availability and timing are confirmed at checkout.</p></div></div></div> }
function CartDrawer({cart, total, close, checkout, remove, changeQuantity}) { return <div className="overlay cart-overlay" role="dialog" aria-modal="true" aria-label="Cart"><aside className="cart-drawer"><div className="cart-head"><div><p className="eyebrow">Ready when you are</p><h2>Your gift bag</h2></div><button onClick={close} aria-label="Close cart"><Icon name="close"/></button></div>{cart.length ? <><div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><ProductArt kind={item.art} image={item.image}/><div className="cart-item-copy"><h3>{item.name}</h3><p>{item.type}</p>{item.customization && <small>{item.customization.photoCount ? `${item.customization.photoCount} personal photo${item.customization.photoCount > 1 ? 's' : ''}` : 'No photos selected'}{item.customization.note ? ' · personal note added' : ''}</small>}<div className="cart-line-bottom"><div className="quantity-control" aria-label={`Quantity for ${item.name}`}><button onClick={() => changeQuantity(item.id, -1)} aria-label={`Decrease quantity of ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label={`Increase quantity of ${item.name}`}>+</button></div><strong>{rupee(item.price * item.quantity)}</strong></div></div><button className="remove-item" onClick={() => remove(item.id)}>Remove</button></div>)}</div><div className="cart-summary"><p><span>Subtotal</span><strong>{rupee(total)}</strong></p><small>Demo checkout — no payment will be collected.</small><button className="primary full" onClick={checkout}>Checkout <Icon name="arrow"/></button></div></> : <div className="empty-cart"><span>♡</span><h3>Your bag is waiting for a memory.</h3><button className="primary" onClick={close}>Explore gifts</button></div>}</aside></div> }

function Checkout({cart, close, complete}) { const [form,setForm]=useState({name:'',phone:'',address:'',city:'',state:'',postal_code:''}); const [busy,setBusy]=useState(false),[error,setError]=useState(''),[order,setOrder]=useState(null); const set=(key,value)=>setForm(current=>({...current,[key]:value})); const place=async event=>{event.preventDefault();setError('');if(Object.values(form).some(value=>!value.trim())){setError('Please complete your name, phone, address, city, state, and postal code.');return;}if(!/^[0-9]{6}$/.test(form.postal_code.trim())){setError('Enter a valid 6-digit postal code.');return;}setBusy(true);try{const created=await createOrder({shipping:{...form,country:'India'},items:cart.map(item=>({product_id:item.id,quantity:item.quantity,customization_text:item.customization?.note||null}))});setOrder(created);}catch(err){setError('Your demo order could not be placed. Please check your details and try again.');}finally{setBusy(false)}};if(order)return <div className="overlay product-overlay" role="dialog" aria-modal="true"><div className="product-modal"><div className="product-details"><p className="eyebrow">Demo order confirmed</p><h2>Order placed successfully.</h2><p className="product-description">Your order ID is <b>{order.order_number}</b>. It is now visible in Admin → Orders.</p><button className="primary full" onClick={complete}>Continue shopping</button></div></div></div>;return <div className="overlay product-overlay" role="dialog" aria-modal="true"><div className="product-modal"><div className="product-details"><p className="eyebrow">Demo checkout</p><h2>Your delivery details</h2><form className="personalization-panel" onSubmit={place}><label className="text-field">Name<input required value={form.name} onChange={e=>set('name',e.target.value)}/></label><label className="text-field">Phone<input required value={form.phone} onChange={e=>set('phone',e.target.value)}/></label><label className="text-field">Address<input required value={form.address} onChange={e=>set('address',e.target.value)}/></label><label className="text-field">City<input required value={form.city} onChange={e=>set('city',e.target.value)}/></label><label className="text-field">State<input required value={form.state} onChange={e=>set('state',e.target.value)}/></label><label className="text-field">Postal code<input required inputMode="numeric" pattern="[0-9]{6}" value={form.postal_code} onChange={e=>set('postal_code',e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Placing order…':'Place demo order'}</button><button type="button" className="text-link" onClick={close}>Back to cart</button></form></div></div></div> }

createRoot(document.getElementById('root')).render(location.pathname.startsWith('/admin') ? <AdminApp/> : <App/>);
