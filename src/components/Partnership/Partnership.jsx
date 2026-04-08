import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import useScrollAnimation from '../../hooks/useScrollAnimation';
import {
  LuTrendingUp,
  LuUsers,
  LuLandmark,
  LuPhone,
  LuMegaphone,
} from 'react-icons/lu';
import './Partnership.css';
import { Link } from 'react-router-dom';

const Partnership = ({ showBenefits = true }) => {
  const { t } = useTranslation('partnership');
  const [ref, isVisible] = useScrollAnimation(0.1);
  const heroBackgroundImage = `${import.meta.env.BASE_URL}company.jpg`;

  return (
    <section className="partnership-container" ref={ref}>
      <div
        className={`partnership-inner scroll-animate ${isVisible ? 'in-view' : ''}`}
      >
        {/* Header */}
        <div className="partnership-header py-20">
          <h2>{t('header.chars')}</h2>
          <p className="subtitle">{t('header.subtitle')}</p>
        </div>

        {/* Hero Section */}
        <div
          className="partnership-hero"
          style={{ backgroundImage: `url(${heroBackgroundImage})` }}
        >
          <div className="hero-badge">{t('hero.badge')}</div>
          <h3 className="hero-title">{t('hero.title')}</h3>
          <p className="hero-cta-text">{t('hero.cta')}</p>
          <a href="tel:400-901-83138" className="phone-btn">
            <LuPhone className="btn-icon" />
            {t('hero.phone')}
          </a>
        </div>

        {/* Market Stats Grid */}
        <div className="stats-grid">
          <StatCard
            icon={<LuUsers />}
            endValue={1500}
            suffix={t('units.tenThousand')}
            label={t('stats.1.label')}
            desc={t('stats.1.desc')}
          />
          <StatCard
            icon={<LuTrendingUp />}
            endValue={1000}
            suffix={t('units.billion')}
            label={t('stats.2.label')}
            desc={t('stats.2.desc')}
          />
          <StatCard
            icon={<LuLandmark />}
            endValue={100}
            suffix="%"
            label={t('stats.3.label')}
            desc={t('stats.3.desc')}
          />
        </div>

        {showBenefits && (
          <div className="benefits-section">
            <div className="benefits-content">
              <h3 className="benefits-title">{t('benefits.title')}</h3>
              <p className="benefits-subtitle">{t('benefits.subtitle')}</p>

              <div className="benefits-list">
                <div className="benefit-item">
                  <div className="benefit-icon-wrapper">1</div>
                  <div>
                    <h4>{t('benefits.list.1.title')}</h4>
                    <p>{t('benefits.list.1.desc')}</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <div className="benefit-icon-wrapper">2</div>
                  <div>
                    <h4>{t('benefits.list.2.title')}</h4>
                    <p>{t('benefits.list.2.desc')}</p>
                  </div>
                </div>
                <div className="benefit-item">
                  <div className="benefit-icon-wrapper">3</div>
                  <div>
                    <h4>{t('benefits.list.3.title')}</h4>
                    <p>{t('benefits.list.3.desc')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="benefits-image-wrapper">
              <img
                src="https://de4965e.webp.li/blog-images/2025/10/9f46fae74442e8cb7e83d891e9c3029a.png"
                alt={t('imageAlt')}
                className="benefits-image"
              />
            </div>
          </div>
        )}

        {/* Footer Policy Banner */}
        <div className="policy-banner">
          <Link to="/contact" className="policy-content">
            <LuMegaphone className="policy-icon" />
            <span className="policy-text">{t('policy.text')}</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

const StatCard = ({ icon, endValue, suffix, label, desc }) => {
  const numberRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const el = numberRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          gsap.fromTo(
            el,
            { innerText: 0 },
            {
              innerText: endValue,
              duration: 2,
              ease: 'power2.out',
              snap: { innerText: 1 }, // Snap to whole numbers
              onUpdate: function () {
                el.innerText = Math.ceil(
                  this.targets()[0].innerText,
                ).toLocaleString();
              },
            },
          );
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [endValue]);

  return (
    <div className="stat-card" ref={cardRef}>
      <div className="stat-header-row">
        <div className="stat-number-wrapper">
          <span ref={numberRef} className="stat-number-text">
            0
          </span>
          <span className="stat-suffix">{suffix}</span>
        </div>
        <div className="stat-icon-wrapper">
          {React.cloneElement(icon, { className: 'stat-icon' })}
        </div>
      </div>

      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-desc">{desc}</div>
      </div>
    </div>
  );
};

export default Partnership;
