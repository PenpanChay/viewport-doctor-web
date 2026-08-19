import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viewport UI Checker",
  description:
    "Automated Responsive UI audit, not just side-by-side screenshots: scans your pages at real screen sizes with a real headless browser, catches responsive layout bugs - overflow, off-screen elements, collisions, distortion, unexpected breakpoints, and more - and hands back the exact numbers plus a suggested CSS fix.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
