"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "./icons";

type Img = { id: string; url: string; thumbUrl: string; alt: string; kind: string; width: number; height: number };

export function Gallery({ images }: { images: Img[] }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="gallery-main" />;
  const n = images.length;
  const show = (k: number) => setI(((k % n) + n) % n);
  const cur = images[i];
  const caption = cur.kind === "wear_closeup" ? "Wear close-up" : `Photo ${i + 1}`;
  return (
    <section aria-label="Photo gallery" className="gallery">
      <div
        className="gallery-main"
        tabIndex={0}
        aria-describedby="gallery-help"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
        }}
      >
        <img src={cur.url} alt={cur.alt} width={cur.width} height={cur.height} fetchPriority="high" />
        {n > 1 && (
          <>
            <button className="gallery-nav prev" type="button" aria-label="Previous photo" onClick={() => show(i - 1)}>
              <ChevronLeft />
            </button>
            <button className="gallery-nav next" type="button" aria-label="Next photo" onClick={() => show(i + 1)}>
              <ChevronRight />
            </button>
          </>
        )}
        <span className="gallery-caption" aria-live="polite">
          {i + 1} / {n} · {caption}
        </span>
      </div>
      <p id="gallery-help" className="visually-hidden">Use the left and right arrow keys to change photos.</p>
      {n > 1 && (
        <ul className="thumbs">
          {images.map((img, k) => (
            <li key={img.id}>
              <button type="button" aria-label={`Show ${img.kind === "wear_closeup" ? "wear close-up" : `photo ${k + 1}`}`} aria-current={k === i ? "true" : undefined} onClick={() => show(k)}>
                <img src={img.thumbUrl} alt="" width={120} height={120} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
