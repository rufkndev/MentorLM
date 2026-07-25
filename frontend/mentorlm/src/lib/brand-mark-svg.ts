/**
 * Брендовый знак-линза как строка SVG + data-URI.
 * Нужен для генерации растровых иконок через next/og (ImageResponse/Satori),
 * где нельзя переиспользовать React-компонент BrandMark напрямую — знак
 * вставляется как <img src="data:image/svg+xml,...">.
 *
 * Геометрия зеркалит components/ui/BrandMark.tsx (единый мотив бренда).
 */

// Знак без плашки (стеклянная сфера + лицо) — для тёмных подложек.
export const BRAND_MARK_SVG = `<svg width="128" height="128" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sphere" x1="7" y1="5" x2="26" y2="28" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3D6BFF"/>
      <stop offset="0.5" stop-color="#1746F5"/>
      <stop offset="1" stop-color="#071B4D"/>
    </linearGradient>
    <linearGradient id="rim" x1="16" y1="3" x2="16" y2="29" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="13" fill="url(#sphere)"/>
  <circle cx="16" cy="16" r="13" fill="none" stroke="url(#rim)" stroke-width="1.1"/>
  <path d="M6.6 20.4A11 11 0 0 1 11 7.2" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="21.6" cy="10" r="1.3" fill="#BFEFFF" fill-opacity="0.85"/>
  <ellipse cx="12.7" cy="15.2" rx="1.5" ry="2.1" fill="#0A1B44"/>
  <ellipse cx="19.3" cy="15.2" rx="1.5" ry="2.1" fill="#0A1B44"/>
  <circle cx="12.2" cy="14.4" r="0.6" fill="#FFFFFF" fill-opacity="0.9"/>
  <circle cx="18.8" cy="14.4" r="0.6" fill="#FFFFFF" fill-opacity="0.9"/>
  <path d="M12.9 19.4 Q16 21.8 19.1 19.4" stroke="#0A1B44" stroke-width="1.5" stroke-linecap="round" fill="none"/>
</svg>`;

// data-URI (utf8, без base64) — безопасно и для Edge, и для Node-рантайма.
export const BRAND_MARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(BRAND_MARK_SVG)}`;
