import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UK Wind Forecast Monitor",
  description: "January 2024 wind generation monitoring app built for the REint full stack challenge."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

