"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type HomeTournamentSlide = {
  id: string;
  href: string;
  title: string;
  statusLabel: string;
  dateLabel: string;
  locationLabel: string;
  detailLabel: string;
};

export function HomeTournamentCarousel({
  slides,
  title
}: {
  slides: HomeTournamentSlide[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) return null;

  const activeSlide = slides[activeIndex];

  return (
    <section className="home-carousel" aria-label={title}>
      <div className="home-carousel-copy">
        <span>{activeSlide.statusLabel}</span>
        <h2><Link href={activeSlide.href}>{activeSlide.title}</Link></h2>
        <p>{activeSlide.dateLabel}</p>
        <p>{activeSlide.locationLabel}</p>
        <strong>{activeSlide.detailLabel}</strong>
      </div>
      {slides.length > 1 ? (
        <div className="home-carousel-dots" aria-hidden="true">
          {slides.map((slide, index) => (
            <span className={index === activeIndex ? "is-active" : ""} key={slide.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
