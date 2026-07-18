import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedCare — Let's Save the World",
  description: "Integrated healthcare for patients, clinicians, hospitals, and organizations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <footer className="site-footer">
          <div className="container-page muted footer-text">
            MedCare · Let&apos;s save the world · Role-based healthcare platform
          </div>
        </footer>
      </body>
    </html>
  );
}
