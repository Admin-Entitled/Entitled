import mobileWordmark from "../assets/entitled-wordmark-mobile.png";
import desktopWordmark from "../assets/entitled-wordmark-desktop.png";

export default function Wordmark({ alt = "Entitled", className = "" }) {
  const productionUrl = "https://www.auth.entitledclub.com";
  const localTestUrl = import.meta.env.VITE_LOCAL_WORDMARK_URL;
  const href = import.meta.env.DEV ? (localTestUrl || "/") : productionUrl;

  return (
    <a href={href} aria-label="Entitled" className="inline-flex items-center">
      <picture>
        <source media="(max-width: 767px)" srcSet={mobileWordmark} />
        <img
          src={desktopWordmark}
          alt={alt}
          className={[
            // Hard constraints so it never blows up the header
            "block h-4 w-auto max-w-[160px] object-contain md:h-[18px] md:max-w-[220px]",
            className,
          ].join(" ")}
        />
      </picture>
    </a>
  );
}
