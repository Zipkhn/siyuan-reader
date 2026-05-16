import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Reader",
    description: "Lecture des documents publiés",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
        </html>
    );
}
