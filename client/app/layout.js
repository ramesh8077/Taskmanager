import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Team Task Manager",
  description:
    "A production-grade team task management platform with role-based access control.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface-primary text-foreground">
        <AuthProvider>
          {children}

          {/* ── Global Toast Notifications ──────────────────────────────── */}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
              style: {
                background: "rgba(15, 15, 25, 0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e8f0",
                backdropFilter: "blur(12px)",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
