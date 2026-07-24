/**
 * SVG-фильтры преломления для «жидкого стекла».
 *
 * Обычный `backdrop-filter: blur()` только размывает фон — стекло выглядит как
 * матовое, без «толщины». Настоящее стекло (iOS 26 / Telegram) искажает
 * (преломляет) контент за собой. Это делает `feDisplacementMap`: сдвигает
 * пиксели фона по карте шума `feTurbulence`, создавая эффект линзы.
 *
 * Фильтры подключаются к поверхностям через `backdrop-filter: url(#id)` в
 * globals.css. Работает в Chromium; Safari молча игнорирует url() в
 * backdrop-filter и остаётся на blur — деградация мягкая.
 *
 * Один скрытый набор фильтров на всё приложение — рендерится в корневом layout.
 */
export function GlassFilters() {
  return (
    <svg
      aria-hidden
      focusable={false}
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <defs>
        {/* Основное преломление: заметное искажение по краям поверхности */}
        <filter
          id="glass-refract"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.011"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2.4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={28}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Мягкое преломление: для крупных карточек — тоньше, чтобы текст на
            них оставался читаемым, но фон за краями «плыл» */}
        <filter
          id="glass-refract-soft"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.01"
            numOctaves={2}
            seed={11}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2.6" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={17}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
