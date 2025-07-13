/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:6482/api/:path*",
      },
    ];
  },
};

export default nextConfig;
