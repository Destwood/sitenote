import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"),
  title: "Sitenote",
  description:
    "Figma-style comments on any live website. Pin feedback to an element or a text selection and discuss it with your team.",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="bg-white font-sans text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
