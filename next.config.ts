import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only serves its client bundle to the origin it was started
  // on (localhost). Testing from a phone on the LAN is a cross-origin request,
  // so Next refuses the chunks: the page renders from the server but never
  // becomes interactive, with no error in the browser. Listing the LAN hosts
  // here is what makes on-device testing work.
  //
  // Development only — this has no effect on a production build.
  allowedDevOrigins: ["192.168.1.109", "*.local"],

  // The clean-PDF print route (/api/print/pdf) drives a real browser on the
  // server. Its packaged Chromium ships as compressed files that must stay
  // where the package expects them, so neither package is bundled, and the
  // Chromium files and the print font are traced into that one function.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/print/pdf": ["./node_modules/@sparticuz/chromium/bin/**", "./src/lib/print/fonts/**"],
  },
};

export default nextConfig;
