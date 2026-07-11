import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // gramJS (MTProto) is large and carries optional native/websocket deps that
  // must resolve at runtime from node_modules, not be inlined by the bundler.
  serverExternalPackages: ["telegram"],
};

export default nextConfig;
