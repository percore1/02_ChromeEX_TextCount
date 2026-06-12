import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TextCount — 文字数カウント & 校閲チェック",
  description:
    "原稿の文字数カウントとローカルルールベースの校閲チェックを、ブラウザ内で完結して行うエディトリアルツール。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
