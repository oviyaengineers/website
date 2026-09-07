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
};

export default nextConfig;
