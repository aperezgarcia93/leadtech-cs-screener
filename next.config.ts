import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node is kept external too (native .node bindings), but the
  // Turbopack dev-mode misresolution originally reported was actually inside
  // onnxruntime-web's bundled onnxruntime-common config loader — added below.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web"],
};

export default nextConfig;
