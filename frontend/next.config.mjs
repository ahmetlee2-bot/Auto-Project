/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    reactCompiler: false
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.supabase.co https://i.ebayimg.com https://*.ebayimg.com https://*.media-amazon.com https://*.ssl-images-amazon.com",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co https://api.autolister-app.de",
          "upgrade-insecure-requests"
        ].join("; ") },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ]
    }];
  }
};

export default nextConfig;
