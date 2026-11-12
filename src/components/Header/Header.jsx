import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LuPhone, LuChevronDown, LuMenu, LuX, LuHeadset } from 'react-icons/lu';
import tinyLogo from '../../assets/tiny-logo.svg';
import qrCodeImg from '../../assets/qr-code.webp';
import gongzhonghaoImg from '../../assets/gongzhonghao.webp';
import './Header.css';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { pathname } = useLocation();
  const [activeMenu, setActiveMenu] = useState(pathname || '/');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useTranslation('common');

  const menuItems = [
    { label: t('nav.home'), href: '/', path: '/' },
    {
      label: t('nav.product'),
      href: '/product-1',
      path: '/product-1',
      children: [
        { label: t('nav.product1'), href: '/product-1' },
        { label: t('nav.product2'), href: '/product-2' },
      ],
    },
    {
      label: t('nav.about'),
      href: '/about/company',
      path: '/about/company',
      children: [
        { label: t('nav.aboutCompany'), href: '/about' },
        { label: t('nav.aboutHonor'), href: '/honor' },
      ],
    },
    {
      label: t('nav.encyclopedia'),
      href: '/encyclopedia',
      path: '/encyclopedia',
    },
    { label: t('nav.cooperation'), href: '/cooperation', path: '/cooperation' },
  ];

  useEffect(() => {
    setActiveMenu(pathname);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleMenuClick = () => {
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="header">
      <div className="comp-inner">
        {/* Left: Navigation */}
        <nav
          className={`header-nav-left ${isMobileMenuOpen ? 'mobile-open' : ''}`}
        >
          {menuItems.map((item, index) => (
            <div key={index} className="nav-menu-item-wrapper">
              <Link
                to={item.href}
                prefetch="intent"
                className={`nav-menu-item ${
                  activeMenu === item.href ||
                  (item.href !== '/' && activeMenu.startsWith(item.href))
                    ? 'active'
                    : ''
                } ${item.children ? 'has-children' : ''}`}
                onClick={(e) => {
                  if (item.children) {
                    e.preventDefault();
                  } else {
                    handleMenuClick();
                  }
                }}
              >
                {item.icon && item.icon}
                {item.label === t('nav.home') ? (
                  <div className="nav-menu-home-wrapper">{item.label}</div>
                ) : (
                  <span
                    style={{
                      minWidth: item.children ? 'unset' : '80px',
                    }}
                  >
                    {item.label}
                  </span>
                )}
                {item.children && (
                  <LuChevronDown className="nav-menu-down-icon" />
                )}
              </Link>
              {item.children && (
                <div className="nav-menu-children-wrapper">
                  {item.children.map((child, childIndex) => (
                    <Link
                      key={childIndex}
                      to={child.href}
                      prefetch="intent"
                      onClick={() => {
                        handleMenuClick();
                      }}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* Mobile-only Contact Us */}
          <div className="nav-menu-item-wrapper mobile-only-item">
            <Link
              to="/contact"
              className={`nav-menu-item ${activeMenu === '/contact' ? 'active' : ''}`}
              onClick={() => {
                handleMenuClick();
              }}
            >
              <span>{t('nav.contact')}</span>
            </Link>
          </div>
        </nav>

        {/* Center: Logo */}
        <Link
          className={`header-logo-center ${activeMenu === '/' ? 'active' : ''}`}
          to="/"
          onClick={() => {
            handleMenuClick();
          }}
        >
          <img
            src={tinyLogo}
            alt={t('footer.logoAlt')}
            className="header-logo"
          />
        </Link>

        {/* Right: Actions (Contact + Mobile Toggle) */}
        <div className="header-actions-right">
          <Link
            to="/contact"
            className={`nav-contact-link_text ${activeMenu === '/contact' ? 'active' : ''}`}
            onClick={() => {
              handleMenuClick();
            }}
          >
            {t('nav.contact')}
          </Link>

          <div className="header-contact-wrapper">
            <button className="header-contact-icon" aria-label="Contact">
              <LuHeadset size={24} />
            </button>
            <div className="header-contact-popup">
              <div className="contact-popup-phone">
                <span>{t('contact.landline')}</span>
                <span>400-901-83138</span>
              </div>
              <div className="contact-popup-qr">
                <div className="qr-item">
                  <img src={qrCodeImg} alt={t('contact.wechatPublic')} />
                  <span>{t('contact.wechatPublic')}</span>
                </div>
                <div className="qr-item">
                  <img src={gongzhonghaoImg} alt={t('contact.miniProgram')} />
                  <span>{t('contact.miniProgram')}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            className="mobile-menu-toggle"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
