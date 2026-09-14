/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
