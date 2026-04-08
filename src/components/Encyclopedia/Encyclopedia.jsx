import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import useScrollAnimation from '../../hooks/useScrollAnimation';
import './Encyclopedia.css';
import { LuArrowRight, LuCalendar } from 'react-icons/lu';

// Article Data
const articles = [
  {
    id: 1,
    image:
      'https://de4965e.webp.li/blog-images/2025/10/2f6a0b55f60a69ba64b0c7e5bf97b5c7.jpg',
    link: 'https://mp.weixin.qq.com/s/OflLi98aHmvZ3DSAzse2FQ',
  },
  {
    id: 2,
    image:
      'https://de4965e.webp.li/blog-images/2025/10/d89cbd705e25b8c7ed4633435d2c9018.jpg',
    link: 'https://mp.weixin.qq.com/s/4rDQ-mbCilaJMlZFwsbyIQ',
  },
  {
    id: 3,
    image:
      'https://de4965e.webp.li/blog-images/2025/10/d2ef59747813c40c6b1850900d8414c5.png',
    link: 'https://mp.weixin.qq.com/s/vH5E34G0YNnd1UeSxwLtPQ',
  },
  {
    id: 4,
    image:
      'https://de4965e.webp.li/blog-images/2025/10/750a08e613813151408136d78b5af9d8.png',
    link: 'https://mp.weixin.qq.com/s/HlTcTUITOZ_z5FsYOEK_vw',
  },
];

const Encyclopedia = () => {
  const { t } = useTranslation('encyclopedia');
  const [ref, isVisible] = useScrollAnimation(0.1);

  return (
    <section className="encyclopedia-container" ref={ref}>
      <div
        className={`encyclopedia-inner scroll-animate ${isVisible ? 'in-view' : ''}`}
      >
        {/* Header */}
        <div className="encyclopedia-header">
          <div className="header-left">
            <div className="title-wrapper">
              <h2>
                {t('header.title')
                  .split('')
                  .map((char, index) => (
                    <span
                      key={index}
                      className="char"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
              </h2>
            </div>
            <div className="subtitle-wrapper">
              <p>{t('header.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="encyclopedia-grid">
          {articles.map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="encyclopedia-card"
            >
              <div className="card-image-wrapper">
                <img src={item.image} alt={item.title} className="card-image" />
              </div>
              <div className="card-content">
                <div className="card-date">
                  <LuCalendar className="date-icon" />
                  {t(`articles.${item.id}.time`)}
                </div>
                <h3 className="card-title">{t(`articles.${item.id}.title`)}</h3>
                <span className="read-more-btn">
                  {t('readMore')} <LuArrowRight className="action-icon" />
                </span>
              </div>
            </a>
          ))}
        </div>

        {/* Bottom Actions */}
        <div className="encyclopedia-footer">
          <Link to="/encyclopedia" className="view-more-btn">
            {t('viewMore')} <LuArrowRight className="action-icon" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Encyclopedia;
