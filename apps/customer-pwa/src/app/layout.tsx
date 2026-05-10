import "./styles.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Marsh Eats",
  description: "Local-first food ordering across Kent with 1% of every order supporting RNLI.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Marsh Eats", statusBarStyle: "black-translucent" }
};

export const viewport = { themeColor: "#0f172a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-GB"><body>{children}<nav className="bottom-nav"><a href="/">Browse</a><a href="/orders">Orders</a><a href="/basket">Basket</a><a href="/account">Account</a></nav><script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}" }} /></body></html>;
}
