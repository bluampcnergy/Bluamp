export interface BrandTheme {
  primary: string;
  primaryHover: string;
  secondary: string;
  focus: string;
  accent: string;
  accentDark: string;
  headerBg: string;
  headerBorder: string;
  subnavActiveBg: string;
  subnavActiveText: string;
  footerBg: string;
}

export interface BrandConfig {
  id: 'dc' | 'bluamp';
  appName: string;
  companyName: string;
  shortName: string;
  legalName: string;
  tagline: string;
  defaultAdminEmail: string;
  supportEmail: string;
  websiteUrl: string;
  logoNavbarUrl: string;
  logoInvoiceUrl: string;
  emailSignatureUrl: string;
  defaultSupabaseUrl: string;
  defaultSupabaseKey: string;
  theme: BrandTheme;
}

export const BRANDS: Record<'dc' | 'bluamp', BrandConfig> = {
  dc: {
    id: 'dc',
    appName: 'Plant Inventory',
    companyName: 'Datlion Cnergy',
    shortName: 'Datlion Cnergy',
    legalName: 'Datlion Cnergy Private Limited',
    tagline: 'Plant Management OS',
    defaultAdminEmail: 'datlioncnergy@gmail.com',
    supportEmail: 'support@cnergy.co.in',
    websiteUrl: 'https://cnergy.co.in',
    logoNavbarUrl: 'https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png',
    logoInvoiceUrl: 'https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png',
    emailSignatureUrl: 'https://supabase.cnergy.co.in/storage/v1/object/public/Logo/Email_signature_3%20(1).png',
    defaultSupabaseUrl: 'https://supabase.cnergy.co.in',
    defaultSupabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
    theme: {
      primary: '#8EBF45',
      primaryHover: '#7cb037',
      secondary: '#658C3E',
      focus: '#527a23',
      accent: '#A8BF75',
      accentDark: '#0D0D0D',
      headerBg: '#0D0D0D',
      headerBorder: '#404040',
      subnavActiveBg: '#8EBF45',
      subnavActiveText: '#0D0D0D',
      footerBg: '#0D0D0D'
    }
  },
  bluamp: {
    id: 'bluamp',
    appName: 'Bluamp Plant OS',
    companyName: 'Bluamp Energy',
    shortName: 'Bluamp',
    legalName: 'Bluamp Energies Pvt. Ltd.',
    tagline: 'Plant OS',
    defaultAdminEmail: 'bluampcnergy@gmail.com',
    supportEmail: 'support@blueamp.cnergy.co.in',
    websiteUrl: 'https://bluampenergy.com',
    logoNavbarUrl: 'https://bluampenergy.com/wp-content/uploads/2018/07/logo-white-001.png',
    logoInvoiceUrl: '/logos/bluamp-logo-color.png',
    emailSignatureUrl: 'https://supabase.cnergy.co.in/storage/v1/object/public/Logo/Email_signature_3%20(1).png',
    defaultSupabaseUrl: 'https://ofnwuifgzqjmmnsqsoed.supabase.co',
    defaultSupabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbnd1aWZnenFqbW1uc3Fzb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQwODQsImV4cCI6MjEwMDM4MDA4NH0.J-EU8aFvlj1o6sMoWWJUJKbp8buMo4V8AbAmT7KkTz8',
    theme: {
      primary: '#498e72',
      primaryHover: '#18484c',
      secondary: '#75c081',
      focus: '#1a639c',
      accent: '#2ca4c2',
      accentDark: '#205f64',
      headerBg: '#205f64',
      headerBorder: 'rgba(44, 164, 194, 0.3)',
      subnavActiveBg: '#205f64',
      subnavActiveText: '#ffffff',
      footerBg: '#205f64'
    }
  }
};

/**
 * Returns the currently active brand based on environment variable VITE_APP_BRAND.
 * Defaults to 'dc' (Datlion Cnergy).
 */
export const getActiveBrand = (): BrandConfig => {
  let brandId: 'dc' | 'bluamp' = 'dc';

  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const envBrand = (import.meta as any).env.VITE_APP_BRAND?.toLowerCase();
    if (envBrand === 'bluamp' || envBrand === 'dc') {
      brandId = envBrand;
    }
  }

  // Runtime localStorage override for local dev testing
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const override = window.localStorage.getItem('bluamp_brand_override');
      if (override === 'bluamp' || override === 'dc') {
        brandId = override;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  return BRANDS[brandId] || BRANDS.dc;
};

/**
 * Applies dynamic brand CSS variables and document metadata.
 */
export const applyBrandTheme = (brand: BrandConfig = getActiveBrand()) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--brand-primary', brand.theme.primary);
  root.style.setProperty('--brand-primary-hover', brand.theme.primaryHover);
  root.style.setProperty('--brand-secondary', brand.theme.secondary);
  root.style.setProperty('--brand-focus', brand.theme.focus);
  root.style.setProperty('--brand-accent', brand.theme.accent);
  root.style.setProperty('--brand-dark', brand.theme.accentDark);
  root.style.setProperty('--brand-header-bg', brand.theme.headerBg);
  root.style.setProperty('--brand-footer-bg', brand.theme.footerBg);

  if (brand.appName && document.title !== brand.appName) {
    document.title = brand.appName;
  }
};
