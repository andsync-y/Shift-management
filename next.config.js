/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 社内向けの非公開システム。全レスポンスに noindex ヘッダーを付け、
  // 検索エンジンにインデックスさせない（meta が効かない経路も含めてカバー）。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
