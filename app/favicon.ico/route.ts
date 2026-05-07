export const dynamic = "force-static";

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#0b2f3a" />
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(-36 64 64)">
      <ellipse cx="48" cy="35" rx="18" ry="26" fill="#f8fbfc" stroke="#f05a3c" stroke-width="6" />
      <path d="M35 24h26M32 35h32M35 46h26M48 11v48M39 15v40M57 15v40" stroke="#0b2f3a" stroke-width="2.5" opacity=".72" />
      <path d="M48 62v47" stroke="#f8fbfc" stroke-width="9" />
      <path d="M48 62v47" stroke="#f05a3c" stroke-width="4" />
      <path d="M40 110h16" stroke="#f8fbfc" stroke-width="9" />
      <path d="M40 110h16" stroke="#f05a3c" stroke-width="4" />
    </g>
    <g transform="rotate(36 64 64)">
      <ellipse cx="80" cy="35" rx="18" ry="26" fill="#f8fbfc" stroke="#45b39d" stroke-width="6" />
      <path d="M67 24h26M64 35h32M67 46h26M80 11v48M71 15v40M89 15v40" stroke="#0b2f3a" stroke-width="2.5" opacity=".72" />
      <path d="M80 62v47" stroke="#f8fbfc" stroke-width="9" />
      <path d="M80 62v47" stroke="#45b39d" stroke-width="4" />
      <path d="M72 110h16" stroke="#f8fbfc" stroke-width="9" />
      <path d="M72 110h16" stroke="#45b39d" stroke-width="4" />
    </g>
    <circle cx="92" cy="92" r="7" fill="#f6d55c" stroke="#f8fbfc" stroke-width="3" />
  </g>
</svg>`;

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8"
    }
  });
}
