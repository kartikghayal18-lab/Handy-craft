import React, { useEffect, useRef, useState } from 'react';
import './coverflow-carousel.css';

const wrapIndex = (index, length) => (index + length) % length;

function ArrowIcon({ direction }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'previous' ? 'm15 18-6-6 6-6' : 'm9 6 6 6-6 6'}/></svg>;
}

export default function CoverFlowCarousel({ items, sectionLabel = 'Featured gifts', autoplay = true, autoplayDelay = 4500, onCtaClick }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef(null);
  const itemCount = items.length;

  const selectPrevious = () => setActiveIndex(index => wrapIndex(index - 1, itemCount));
  const selectNext = () => setActiveIndex(index => wrapIndex(index + 1, itemCount));

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(0, itemCount - 1)));
  }, [itemCount]);

  useEffect(() => {
    if (!autoplay || paused || itemCount < 2) return undefined;
    const timer = window.setInterval(selectNext, autoplayDelay);
    return () => window.clearInterval(timer);
  }, [autoplay, autoplayDelay, itemCount, paused]);

  const relativePosition = index => {
    let position = index - activeIndex;
    const midpoint = itemCount / 2;
    if (position > midpoint) position -= itemCount;
    if (position < -midpoint) position += itemCount;
    return position;
  };

  const finishSwipe = clientX => {
    if (pointerStart.current == null) return;
    const distance = clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 42) return;
    if (distance > 0) selectPrevious(); else selectNext();
  };

  return <section className="coverflow-section" aria-label={sectionLabel} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div className="coverflow-heading">
      <p>Featured gifts</p>
      <h2>Made for the moments that stay.</h2>
    </div>
    <div className="coverflow-stage" onPointerDown={event => { pointerStart.current = event.clientX; event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerUp={event => finishSwipe(event.clientX)} onPointerCancel={() => { pointerStart.current = null; }}>
      <button className="coverflow-arrow coverflow-arrow-previous" type="button" onClick={selectPrevious} aria-label="Previous featured gift"><ArrowIcon direction="previous"/></button>
      <div className="coverflow-track">
        {items.map((item, index) => {
          const position = relativePosition(index);
          const isActive = position === 0;
          return <article className={`coverflow-card ${isActive ? 'is-active' : ''}`} style={{ '--coverflow-position': position, '--coverflow-distance': Math.abs(position), zIndex: 10 - Math.abs(position) }} aria-hidden={!isActive} key={item.productId}>
            <img src={item.img} alt={item.titleLine1} draggable="false"/>
            <div className="coverflow-shade"/>
            <div className="coverflow-card-copy">
              <span>{item.tag}</span>
              <h3>{item.titleLine1}<small>{item.titleLine2}</small></h3>
              <p>{item.desc}</p>
              {item.price && <strong>{item.price}</strong>}
              <button type="button" onClick={() => onCtaClick?.(item)} tabIndex={isActive ? 0 : -1}>{item.ctaText}</button>
            </div>
          </article>;
        })}
      </div>
      <button className="coverflow-arrow coverflow-arrow-next" type="button" onClick={selectNext} aria-label="Next featured gift"><ArrowIcon direction="next"/></button>
    </div>
    <div className="coverflow-dots" aria-label="Choose featured gift">
      {items.map((item, index) => <button type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show ${item.titleLine1}`} aria-current={index === activeIndex ? 'true' : undefined} key={item.productId}/>) }
    </div>
  </section>;
}
