import mobileWordmark from "../assets/entitled-wordmark-mobile.png";
import desktopWordmark from "../assets/entitled-wordmark-desktop.png";

export default function Wordmark({ alt = "Entitled Club", className = "wordmarkImg" }) {
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={mobileWordmark} />
      <img className={className} src={desktopWordmark} alt={alt} />
    </picture>
  );
}
