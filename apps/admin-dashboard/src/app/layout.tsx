import type { ReactNode } from "react";
import "./styles.css";
export const metadata = { title: "Marsh Eats Admin" };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en-GB"><body>{children}</body></html>; }
