import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Keep `pg` out of the server bundle and require it at runtime instead.
   *
   * node-postgres declares `pg-native` as an optional peer dependency and
   * `pg-cloudflare` as an optional dependency, and reaches for both through
   * conditional requires. A bundler has to resolve those statically, and what
   * it produces works in a local `next start` — where node_modules is sitting
   * right there — but can break inside a serverless function bundle. The
   * signature is a build that passes and a runtime that 500s, which is exactly
   * what the deployed site did.
   *
   * Externalising it is the supported way to use a native-ish database driver
   * from server components. It is not an optimisation; without it the driver is
   * not reliably usable in production.
   */
  serverExternalPackages: ['pg'],
};

export default nextConfig;
