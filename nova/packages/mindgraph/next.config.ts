import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nova/mindgraph-view", "@nova/mindgraph-source-fs"],
};

export default config;
