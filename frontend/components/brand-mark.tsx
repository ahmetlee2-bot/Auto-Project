import Link from "next/link";

export function BrandMark({
  href = "/",
  light = false,
}: {
  href?: string;
  light?: boolean;
}) {
  return (
    <Link
      className={`brandMark${light ? " brandMarkLight" : ""}`}
      href={href}
      aria-label="AutoLister Startseite"
    >
      <span className="brandMarkIcon" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8 29.5 19.4 8h4.4L35 29.5h-6.7l-6.7-13.2-6.8 13.2H8Z"
            fill="currentColor"
          />
          <path
            d="M14.6 25h16.2"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="m29.4 21.9 3.6 3.1-3.6 3.1"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>AutoLister</span>
    </Link>
  );
}
