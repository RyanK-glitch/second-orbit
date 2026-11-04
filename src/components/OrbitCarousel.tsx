"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type OrbitItem = { id: string; image: string; price: string };

const SPEED = 0.35; // radians per second: one lap every ~18s
const START = Math.PI / 2; // the first listing starts at the front

/** Position on the ellipse for item i of n at phase p: x/y in [-1, 1], depth d in [0, 1] (1 = front). */
function place(i: number, n: number, phase: number) {
  const a = phase + (i / n) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a), d: (Math.sin(a) + 1) / 2 };
}

const vars = (p: ReturnType<typeof place>) =>
  ({ "--x": p.x.toFixed(4), "--y": p.y.toFixed(4), "--d": p.d.toFixed(4) }) as React.CSSProperties;

/**
 * Hero orbit: featured listings circle a planet. Server-rendered at the starting position, so the
 * first frame is complete without JS. The animation only writes three CSS variables per card, stops
 * for reduced motion, while hovered or focused, while off-screen, and when the visitor pauses it.
 */
export function OrbitCarousel({ items }: { items: OrbitItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [canMove, setCanMove] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const el = root.current;
    if (!el || items.length < 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sats = Array.from(el.querySelectorAll<HTMLElement>(".orbit-sat"));
    let phase = START;
    let last = 0;
    let raf = 0;
    let visible = true;
    let hovered = false;

    const frame = (now: number) => {
      // Cap the step so returning to a background tab doesn't jump the orbit.
      const dt = last ? Math.min(now - last, 50) / 1000 : 0;
      last = now;
      if (!hovered && !pausedRef.current) phase += dt * SPEED;
      sats.forEach((s, i) => {
        const p = place(i, sats.length, phase);
        s.style.setProperty("--x", p.x.toFixed(4));
        s.style.setProperty("--y", p.y.toFixed(4));
        s.style.setProperty("--d", p.d.toFixed(4));
        s.classList.toggle("front", p.d > 0.5);
      });
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      last = 0;
      const run = !reduce.matches && visible;
      setCanMove(!reduce.matches);
      if (run) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    io.observe(el);
    const enter = () => (hovered = true);
    const leave = () => (hovered = false);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", enter);
    el.addEventListener("focusout", leave);
    reduce.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      reduce.removeEventListener("change", sync);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", enter);
      el.removeEventListener("focusout", leave);
    };
  }, [items.length]);

  return (
    <div className="orbit" ref={root}>
      <span className="orbit-ring" aria-hidden="true" />
      <span className="orbit-planet" aria-hidden="true" />
      {items.map((item, i) => {
        const p = place(i, items.length, START);
        return (
          <Link key={item.id} href={`/listings/${item.id}`} className={`orbit-sat${p.d > 0.5 ? " front" : ""}`} style={vars(p)} tabIndex={-1} aria-hidden="true">
            <img src={item.image} alt="" width={600} height={600} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} />
            <span>{item.price}</span>
          </Link>
        );
      })}
      {canMove && (
        <button type="button" className="orbit-toggle" onClick={() => setPaused((v) => !v)} aria-label={paused ? "Play the orbit animation" : "Pause the orbit animation"}>
          {paused ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
