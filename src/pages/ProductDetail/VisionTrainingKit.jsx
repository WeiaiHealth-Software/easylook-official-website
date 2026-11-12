import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards, Navigation, Pagination } from 'swiper/modules';
import {
  LuShoppingCart,
  LuPackage,
  LuGraduationCap,
  LuSwatchBook,
  LuCircleCheck,
} from 'react-icons/lu';
import useScrollAnimation from '../../hooks/useScrollAnimation';
import Breadcrumbs from '../../components/Shared/Breadcrumbs';
// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-cards';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import './VisionTrainingKit.css';

// Import Assets
import qrCode from '../../assets/qr-code.webp';
import kitImage from '../../assets/xunlianhe.webp';
import taobaoQr from '../../assets/products/taobao-qrcode.webp';
import jdQr from '../../assets/products/jd-qrcode.webp';

// Animation Helper
const AnimatedTitle = ({ text, className }) => (
  <h2 className={className}>
    {text.split('').map((char, i) => (
      <span
        key={i}
        className="char"
        style={{ display: 'inline-block', animationDelay: `${i * 0.05}s` }}
      >
        {char === ' ' ? '\u00A0' : char}
      </span>
    ))}
  </h2>
);

// Mock Data
const VisionTrainingKit = () => {
  const { t } = useTranslation('visionTrainingKit');
  const videoCategories = t('videosSection.categories', {
    returnObjects: true,
  });
  const videos = t('videosSection.videoList', { returnObjects: true });
  const [activeCategory, setActiveCategory] = useState('strabismus');
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [bannerRef, bannerVisible] = useScrollAnimation(0.1);
  const [heroRef, heroVisible] = useScrollAnimation(0.1);
  const [featuresRef, featuresVisible] = useScrollAnimation(0.1);
  const [videosRef, videosVisible] = useScrollAnimation(0.1);

  const currentVideos = videos[activeCategory] || videos.strabismus;
  const currentVideo = currentVideos[activeVideoIndex] || currentVideos[0];

  return (
    <div className="product-detail-page">
      <Helmet>
        <title>{t('helmet.title')}</title>
        <meta name="description" content={t('helmet.description')} />
      </Helmet>

      {/* Top Banner Section */}
      <section
        className={`detail-banner ${bannerVisible ? 'in-view' : ''} py-20`}
        ref={bannerRef}
      >
        <div className="banner-content">
          <AnimatedTitle text={t('banner.title')} className="banner-title" />
          <p className="banner-subtitle">{t('banner.subtitle')}</p>
        </div>
      </section>

      {/* Hero Section */}
      <section
        className={`hero-section scroll-animate ${heroVisible ? 'in-view' : ''}`}
        ref={heroRef}
      >
        <div className="hero-grid">
          <div className="hero-content">
            <p className="hero-description">{t('hero.description')}</p>

            <div className="buy-button-wrapper">
              <button className="buy-button">
                <LuShoppingCart className="cart-icon" />
                <span>{t('hero.buy')}</span>
              </button>

              <div className="qr-popup">
                <p className="qr-popup-title">{t('hero.scanBuy')}</p>
                <div className="qr-popup-list">
                  <div className="qr-popup-item">
                    <img
                      src={qrCode}
                      alt={t('hero.miniProgram')}
                      className="qr-popup-image"
                    />
                    <span className="qr-popup-label">
                      {t('hero.miniProgram')}
                    </span>
                  </div>
                  <div className="qr-popup-item">
                    <img
                      src={taobaoQr}
                      alt={t('hero.taobao')}
                      className="qr-popup-image"
                    />
                    <span className="qr-popup-label">{t('hero.taobao')}</span>
                  </div>
                  <div className="qr-popup-item">
                    <img
                      src={jdQr}
                      alt={t('hero.jd')}
                      className="qr-popup-image"
                    />
                    <span className="qr-popup-label">{t('hero.jd')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-image-wrapper">
            <Swiper
              effect={'cards'}
              grabCursor={true}
              modules={[EffectCards]}
              className="hero-swiper"
            >
              <SwiperSlide className="hero-swiper-slide">
                <img src={kitImage} alt={t('images.slide1')} />
              </SwiperSlide>
              <SwiperSlide className="hero-swiper-slide">
                <img src={kitImage} alt={t('images.slide2')} />
              </SwiperSlide>
              <SwiperSlide className="hero-swiper-slide">
                <img src={kitImage} alt={t('images.slide3')} />
              </SwiperSlide>
            </Swiper>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        className={`features-section scroll-animate ${featuresVisible ? 'in-view' : ''}`}
        ref={featuresRef}
      >
        <div className="section-header">
          <h2 className="section-title">{t('features.title')}</h2>
          <p className="section-subtitle">{t('features.subtitle')}</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <LuPackage />
            </div>
            <div className="feature-content">
              <h3 className="feature-title">{t('features.list.1.title')}</h3>
              <p className="feature-description">
                {t('features.list.1.description')}
              </p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <LuCircleCheck />
            </div>
            <div className="feature-content">
              <h3 className="feature-title">{t('features.list.2.title')}</h3>
              <p className="feature-description">
                {t('features.list.2.description')}
              </p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <LuGraduationCap />
            </div>
            <div className="feature-content">
              <h3 className="feature-title">{t('features.list.3.title')}</h3>
              <p className="feature-description">
                {t('features.list.3.description')}
              </p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <LuSwatchBook />
            </div>
            <div className="feature-content">
              <h3 className="feature-title">{t('features.list.4.title')}</h3>
              <p className="feature-description">
                {t('features.list.4.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Videos Section */}
      <section
        className={`videos-section scroll-animate ${videosVisible ? 'in-view' : ''}`}
        ref={videosRef}
      >
        <div className="section-header">
          <h2 className="section-title">{t('videosSection.title')}</h2>
          <div className="video-tabs">
            {videoCategories.map((cat) => (
              <button
                key={cat.id}
                className={`tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setActiveVideoIndex(0);
                }}
              >
                <span className="tab-title">{cat.title}</span>
                <span className="tab-count">
                  {cat.count} {t('videosSection.countSuffix')}
                </span>
              </button>
            ))}
          </div>
          <p className="category-description">
            {videoCategories.find((c) => c.id === activeCategory)?.description}
          </p>
        </div>

        <div className="player-layout">
          <div className="main-video">
            <div className="video-container">
              <div className="video-container">
                <video
                  key={currentVideo.src}
                  className="native-video"
                  controls
                  controlsList="nodownload"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  poster={currentVideo.poster}
                >
                  <source src={currentVideo.src} type="video/mp4" />
                  您的浏览器不支持视频播放。
                </video>
              </div>
            </div>
            <div className="video-info">
              <h3 className="video-title">{currentVideo.title}</h3>
              <p className="video-description">{currentVideo.subtitle}</p>
            </div>
          </div>

          <div className="playlist-panel">
            <p className="playlist-title">{t('videosSection.playlistTitle')}</p>
            <div className="video-thumbnails">
              {currentVideos.map((vid, idx) => (
                <button
                  key={idx}
                  className={`thumbnail-btn ${activeVideoIndex === idx ? 'active' : ''}`}
                  onClick={() => setActiveVideoIndex(idx)}
                >
                  <div
                    className="thumbnail-card"
                    style={{ backgroundImage: `url(${vid.poster})` }}
                  >
                    <div className="thumbnail-overlay">
                      <p className="thumbnail-title">{vid.title}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: t('breadcrumbs'), href: '/' }]} />
    </div>
  );
};

export default VisionTrainingKit;
