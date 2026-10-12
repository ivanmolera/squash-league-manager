"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type HomeTournamentSlide = {
  id: string;
  href: string;
  title: string;
  posterUrl: string | null;
  statusLabel: string;
  dateLabel: string;
  locationLabel: string;
  detailLabel: string;
};

export function HomeTournamentCarousel({
  slides,
  title,
  posterLabel
}: {
  slides: HomeTournamentSlide[];
  title: string;
  posterLabel: string;
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
    <section className={`home-carousel${activeSlide.posterUrl ? " has-poster" : ""}`} aria-label={title}>
      <div className="home-carousel-copy">
        <span>{activeSlide.statusLabel}</span>
        <h2><Link href={activeSlide.href}>{activeSlide.title}</Link></h2>
        <p>{activeSlide.dateLabel}</p>
        <p>{activeSlide.locationLabel}</p>
        <strong>{activeSlide.detailLabel}</strong>
      </div>
      {activeSlide.posterUrl ? (
        <Link className="home-carousel-poster" href={activeSlide.href} aria-label={`${posterLabel}: ${activeSlide.title}`}>
          <img src={activeSlide.posterUrl} alt={`${posterLabel}: ${activeSlide.title}`} />
        </Link>
      ) : null}
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
