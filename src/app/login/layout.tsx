import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar · Build.Connect",
  description: "Acesse sua conta corporativa.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
