'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * The motion engine. One smooth-scroll driver (Lenis) and one animation
 * system (GSAP), both driven by data attributes so server-rendered markup
 * stays complete with JavaScript disabled:
 *
 *   data-hero        the hero container; its [data-hero-item] children play
 *                    a composed intro timeline on page load.
 *   data-hero-media  parallax target inside the hero (scrubbed, yPercent -8).
 *   data-split       heading is split into word spans for a staggered rise.
 *                    The full text becomes the aria-label, the spans are
 *                    aria-hidden, and links/emphasis inside animate as units.
 *   data-reveal      block rises into view on scroll (optional
 *                    data-reveal-delay in seconds).
 *
 * SCOPE. Lenis and the reveals run on marketing routes only — never on
 * /book, /b/[token] or /admin, where smooth scrolling and scroll-driven
 * animation would fight date pickers, the diary grid and voucher flows.
 * Reduced motion renders every final state immediately: this component
 * mounts nothing and the CSS kills the remaining transitions.
 */
const MOTION_ROUTES = new Set(['/', '/prices', '/about', '/contact', '/gallery', '/privacy']);

function motionEnabled(pathname: string): boolean {
  if (MOTION_ROUTES.has(pathname)) return true;
  // The treatments hub, category and service pages share the same system.
  return pathname === '/treatments' || pathname.startsWith('/treatments/');
}

function splitWords(el: HTMLElement) {
  const label = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return [];
  el.setAttribute('aria-label', label);
  const animated: HTMLElement[] = [];
  // insert-then-move: the wrapper goes in first while `ref` is still a
  // child, and only then is content moved inside it.
  const wrapContent = (ref: Node, content: Node) => {
    const outer = document.createElement('span');
    outer.className = 'w';
    outer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    outer.appendChild(inner);
    el.insertBefore(outer, ref);
    inner.appendChild(content);
    animated.push(inner);
  };
  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent!.split(/(\s+)/);
      words.forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          el.insertBefore(document.createTextNode(' '), node);
        } else {
          wrapContent(node, document.createTextNode(part));
        }
      });
      el.removeChild(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      wrapContent(node, node);
    }
  });
  return animated;
}

export function MotionEngine() {
  const pathname = usePathname();

  useEffect(() => {
    if (!motionEnabled(pathname)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // The one smooth-scroll engine.
      const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      const raf = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);

      // Hero intro: media settles first, then the message cascades.
      const hero = document.querySelector('[data-hero]');
      if (hero) {
        const items = hero.querySelectorAll('[data-hero-item]');
        if (items.length) {
          gsap.from(items, {
            y: 30,
            opacity: 0,
            duration: 0.9,
            ease: 'power3.out',
            stagger: 0.1,
          });
        }
        const badge = hero.querySelector('[data-hero-badge]');
        if (badge) {
          gsap.from(badge, {
            scale: 0.7,
            opacity: 0,
            duration: 0.8,
            ease: 'back.out(1.6)',
            delay: 0.55,
          });
        }
      }

      // Word-by-word headings.
      document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
        const words = splitWords(el);
        if (!words.length) return;
        gsap.from(words, {
          yPercent: 110,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: 'top 88%' },
        });
      });

      // Supporting blocks.
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.85,
          ease: 'power3.out',
          delay: Number(el.dataset.revealDelay ?? 0),
          scrollTrigger: { trigger: el, start: 'top 90%' },
        });
      });

      // Hero photo drifts against the scroll.
      const media = document.querySelector('[data-hero-media]');
      if (media) {
        gsap.to(media, {
          yPercent: -7,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-hero]',
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      }

      const refresh = () => ScrollTrigger.refresh();
      if (document.fonts?.ready) document.fonts.ready.then(refresh);
      window.addEventListener('load', refresh);

      return () => {
        window.removeEventListener('load', refresh);
        gsap.ticker.remove(raf);
        lenis.destroy();
      };
    });
    return () => ctx.revert();
  }, [pathname]);

  return null;
}
