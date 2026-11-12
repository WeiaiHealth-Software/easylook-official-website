import React from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { LuMapPin, LuPhone, LuMail } from 'react-icons/lu';
import Breadcrumbs from '../../components/Shared/Breadcrumbs';
import ContactForm from '../../components/ContactForm/ContactForm';
import mapImg from '../../assets/map.webp';
import './Contact.css';

const Contact = () => {
  const { t } = useTranslation('contact');
  const { t: tCommon } = useTranslation('common');
  return (
    <div className="contact-page">
      <Helmet>
        <title>{t('helmet.title')}</title>
        <meta name="description" content={t('helmet.description')} />
      </Helmet>

      <div className="contact-container">
        <div className="contact-header py-20">
          <h2>{t('header.title')}</h2>
          <p className="subtitle">{t('header.subtitle')}</p>
        </div>

        {/* Map Section */}
        <div className="contact-map-section">
          <div className="map-wrapper">
            <img src={mapImg} alt={t('map.imageAlt')} className="map-image" />
          </div>
        </div>

        {/* Contact Info Cards - 3 columns */}
        <div className="contact-info-grid">
          {/* Address Card */}
          <div className="contact-info-card">
            <div className="contact-info-header">
              <div className="contact-info-icon">
                <LuMapPin />
              </div>
              <h4 className="contact-info-title">{t('info.address.title')}</h4>
            </div>
            <p className="contact-info-content">{tCommon('contact.addressValue')}</p>
          </div>

          {/* Phone Card */}
          <div className="contact-info-card">
            <div className="contact-info-header">
              <div className="contact-info-icon">
                <LuPhone />
              </div>
              <h4 className="contact-info-title">{t('info.phone.title')}</h4>
            </div>
            <p className="contact-info-content">{tCommon('contact.phoneValue')}</p>
          </div>

          {/* Email Card */}
          <div className="contact-info-card">
            <div className="contact-info-header">
              <div className="contact-info-icon">
                <LuMail />
              </div>
              <h4 className="contact-info-title">{t('info.email.title')}</h4>
            </div>
            <p className="contact-info-content">{tCommon('contact.emailValue')}</p>
          </div>
        </div>
      </div>

      {/* Online Message Form */}
      <ContactForm />

      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: t('breadcrumbs') }]} />
    </div>
  );
};

export default Contact;
