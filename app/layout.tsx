import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Watch",
  description: "New AI model releases across providers, aggregated.",
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
      "application/atom+xml": "/feed.atom",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
