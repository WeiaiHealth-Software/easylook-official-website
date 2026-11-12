import React from 'react';
import { useTranslation } from 'react-i18next';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/autoplay';

import './PartnerScroll.css';

import partner13 from '../../assets/partners/partner-13.webp';
import partner14 from '../../assets/partners/partner-14.webp';
import partner16 from '../../assets/partners/partner-16.webp';
import partner17 from '../../assets/partners/partner-17.webp';
import partner18 from '../../assets/partners/partner-18.webp';
import partner19 from '../../assets/partners/partner-19.webp';
import partner20 from '../../assets/partners/partner-20.webp';
import partner21 from '../../assets/partners/partner-21.webp';
import partner24 from '../../assets/partners/partner-24.webp';
import partner1 from '../../assets/partners/partner-1.webp';
import partner2 from '../../assets/partners/partner-2.webp';
import partner3 from '../../assets/partners/partner-3.webp';
import partner4 from '../../assets/partners/partner-4.webp';
import partner5 from '../../assets/partners/partner-5.webp';
import partner6 from '../../assets/partners/partner-6.webp';
import partner7 from '../../assets/partners/partner-7.webp';
import partner8 from '../../assets/partners/partner-8.webp';
import partner10 from '../../assets/partners/partner-10.webp';
import partner11 from '../../assets/partners/partner-11.webp';
import partner12 from '../../assets/partners/partner-12.webp';

const partnerLogos = [
  partner13,
  partner14,
  partner16,
  partner17,
  partner18,
  partner19,
  partner20,
  partner21,
  partner24,
  partner1,
  partner2,
  partner3,
  partner4,
  partner5,
  partner6,
  partner7,
  partner8,
  partner10,
  partner11,
  partner12,
];

// Split logos into two rows
const row1 = partnerLogos.slice(0, 10);
const row2 = partnerLogos.slice(10, 20);

const PartnerScroll = () => {
  const { t } = useTranslation('cooperation');
  return (
    <section className="partner-scroll-section">
      <div className="partner-scroll-header">
        <h2>{t('partnerScroll.header.title')}</h2>
        <p className="subtitle">{t('partnerScroll.header.subtitle')}</p>
      </div>

      {/* Row 1: Left to Right */}
      <div className="partners-swiper-container">
        <Swiper
          modules={[Autoplay]}
          spaceBetween={24}
          slidesPerView={2.5}
          loop={true}
          speed={5000}
          autoplay={{
            delay: 0,
            disableOnInteraction: false,
          }}
          breakpoints={{
            640: { slidesPerView: 3.75 },
            768: { slidesPerView: 5 },
            1024: { slidesPerView: 7.5 },
          }}
          className="partners-swiper"
        >
          {row1.map((logo, index) => (
            <SwiperSlide key={index}>
              <div className="partner-item">
                <img
                  src={logo}
                  alt={`Partner ${index + 1}`}
                  className="partner-logo"
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Row 2: Right to Left */}
      <div className="partners-swiper-container">
        <Swiper
          modules={[Autoplay]}
          spaceBetween={24}
          slidesPerView={2.5}
          loop={true}
          speed={6000} // Slightly different speed for variation
          autoplay={{
            delay: 0,
            disableOnInteraction: false,
            reverseDirection: true, // Opposite direction
          }}
          breakpoints={{
            640: { slidesPerView: 3.75 },
            768: { slidesPerView: 5 },
            1024: { slidesPerView: 7.5 },
          }}
          className="partners-swiper"
        >
          {row2.map((logo, index) => (
            <SwiperSlide key={index}>
              <div className="partner-item">
                <img
                  src={logo}
                  alt={`Partner ${index + 11}`}
                  className="partner-logo"
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
};

export default PartnerScroll;
