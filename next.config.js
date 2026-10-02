/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "bullmq",
      "ioredis",
      "@prisma/client",
      "mailparser",
      "googleapis",
    ],
  },
};

module.exports = nextConfig;
