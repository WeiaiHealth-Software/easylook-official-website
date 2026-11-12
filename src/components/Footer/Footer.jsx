import { Link } from 'react-router-dom';
import { LuPhone, LuMail, LuMapPin } from 'react-icons/lu';
import logoSvg from '../../assets/full-logo.webp';
import gongzhonghaoImg from '../../assets/gongzhonghao.webp';
import qrCodeImg from '../../assets/qr-code.webp';
import './Footer.css';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation('common');

  const quickLinks = [
    { label: t('nav.product'), href: '/product-1' },
    { label: t('nav.encyclopedia'), href: '/encyclopedia' },
    { label: t('nav.cooperation'), href: '/cooperation' },
    { label: t('nav.about'), href: '/about/company' },
  ];

  const contactInfo = [
    {
      icon: <LuPhone />,
      label: t('contact.phone'),
      value: '400-901-83138',
    },
    {
      icon: <LuMail />,
      label: t('contact.email'),
      value: 'easylook.business@weiaihealthcare.com',
    },
    {
      icon: <LuMapPin />,
      label: t('contact.address'),
      value: t('contact.addressValue'),
    },
  ];

  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Top Section */}
        <div className="footer-top">
          {/* Logo and Description */}
          <div className="footer-brand">
            <img
              src={logoSvg}
              alt={t('footer.logoAlt')}
              className="footer-logo"
            />
            <p className="footer-description">{t('footer.description')}</p>
          </div>

          {/* Quick Links */}
          <div className="footer-links-section">
            <h3 className="footer-section-title">{t('footer.quickLinks')}</h3>
            <ul className="footer-links-list">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <Link to={link.href} prefetch="intent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div className="footer-contact">
            <h3 className="footer-section-title">{t('footer.contactInfo')}</h3>
            <ul className="footer-contact-list">
              {contactInfo.map((item, index) => (
                <li key={index} className="footer-contact-item">
                  <div className="footer-contact-header">
                    <span className="footer-contact-icon">{item.icon}</span>
                    <span className="footer-contact-label">{item.label}</span>
                  </div>
                  <span className="footer-contact-value">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Follow Us - QR Codes */}
          <div className="footer-follow">
            <h3 className="footer-section-title">{t('footer.followUs')}</h3>
            <div className="footer-qr-codes">
              <div className="footer-qr-item">
                <img
                  src={qrCodeImg}
                  alt={t('contact.wechatPublic')}
                  className="footer-qr-image"
                />
                <span>{t('contact.wechatPublic')}</span>
              </div>
              <div className="footer-qr-item">
                <img
                  src={gongzhonghaoImg}
                  alt={t('contact.miniProgram')}
                  className="footer-qr-image"
                />
                <span>{t('contact.miniProgram')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="footer-bottom">
          <p className="footer-copyright">
            {t('footer.copyright', { year: currentYear })}
          </p>
          <div className="footer-legal">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('footer.beian')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
