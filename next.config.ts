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

  /**
   * Retired category URLs from the previous price list (migration 0010).
   *
   * The 2026-10-30 flyer drops the standalone pedicure, facials, makeup and
   * body-treatment headings, so those pages no longer render. They were
   * indexed by Google, and a 404 on an indexed URL throws away whatever
   * authority it earned, so they point somewhere instead:
   *
   *  - /treatments/pedicure  -> /treatments/manicure
   *    The pedicure lines did not disappear, they moved under the MANICURE
   *    heading on the flyer. This is a genuine same-topic move.
   *  - the other three -> /treatments
   *    Those ranges are hidden until the owner confirms she still offers
   *    them, which is not the same as gone. Sending visitors to the hub is
   *    honest; sending them to a specific page that may come back would be
   *    worse than not redirecting at all.
   *
   * If the ranges return, delete the matching entry here.
   */
  async redirects() {
    return [
      /**
       * One site, one address.
       *
       * Vercel serves every project on `<project>.vercel.app` and there is no
       * switch to turn that off. So when the custom domain was connected, the
       * same pages started answering on two hostnames, and Google indexed both
       * of them: searching for the salon returned a vercel.app result next to
       * the real domain. Same content, two URLs, split authority.
       *
       * Sending the alias to the custom domain fixes it at the source. The
       * canonical tags in each page's metadata are the backstop, for anything
       * that reaches the alias without following a redirect.
       */
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'smart-nails-and-beauty-spa.vercel.app' }],
        destination: 'https://www.smartnailsandbeautyspa.co.za/:path*',
        permanent: true,
      },
      { source: '/treatments/pedicure', destination: '/treatments/manicure', permanent: true },
      { source: '/treatments/facials', destination: '/treatments', permanent: false },
      { source: '/treatments/makeup', destination: '/treatments', permanent: false },
      { source: '/treatments/body-treatments', destination: '/treatments', permanent: false },
    ];
  },
};

export default nextConfig;
