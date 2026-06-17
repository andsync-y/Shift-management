import type { MetadataRoute } from "next";

// 社内向けの非公開システムのため、全クローラーにクロールを拒否する。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
