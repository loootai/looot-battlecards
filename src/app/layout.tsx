import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppShell, type ShellNavSection } from "@/components/AppShell";
import { currentCsrf, requireAdminPage } from "@/lib/auth/guard";
import { isPublicPath } from "@/lib/auth/routes";
import { usdPrecise } from "@/lib/money";
import { isDemo, loadCards } from "@/lib/store";
import "./globals.css";

export const dynamic = "force-dynamic";

const NAV: ShellNavSection[] = [
  {
    items: [
      { href: "/", label: "Battlecards", icon: "swords", also: ["/card"] },
      { href: "/build", label: "Build", icon: "play" },
    ],
  },
];

export const metadata: Metadata = {
  title: { default: "looot-battlecards", template: "%s | looot-battlecards" },
  description: "Competitive battlecards with a source and a date on every claim. Built on looot.",
  icons: { icon: "/brand/looot-mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1512" },
  ],
};

// Sets the theme class before the first paint. ?theme=dark or ?theme=light overrides the saved choice for one view.
const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-battlecards-path") ?? "";
  // Public routes (sign-in) render with no stored data and no admin navigation.
  if (path !== "" && isPublicPath(path)) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="min-h-dvh bg-page text-ink">
          <main className="mx-auto min-h-dvh max-w-xl px-4 py-10">{children}</main>
        </body>
      </html>
    );
  }
  const gate = await requireAdminPage();
  const csrf = await currentCsrf();
  const { cards } = await loadCards();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <meta name="battlecards-csrf" content={csrf} />
      </head>
      <body className="min-h-dvh bg-page text-ink">
        <AppShell
          appName="looot-battlecards"
          githubHref="https://github.com/loootai/looot-battlecards"
          nav={NAV}
          demoLabel={gate.policy.mode === "open-demo" ? "Demo, no sign-in" : isDemo() ? "Demo data, no looot calls" : undefined}
          signOut={gate.policy.mode === "login"}
          spend={cards.length > 0 ? { label: "Charged by looot", spent: usdPrecise(cards.reduce((n, c) => n + c.costMicros, 0)) } : undefined}
          primaryAction={{ href: "/build", label: "Build cards" }}
        >
          <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
        </AppShell>
      </body>
    </html>
  );
}
