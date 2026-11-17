import Link from "next/link";
import type { SessionUser } from "@/domain/auth";
import { logOutAction } from "@/server/actions/auth";

type Tab = "erbjudanden" | "salj" | "mina-kort";

const tabs: { id: Tab; href: string; label: string }[] = [
  { id: "erbjudanden", href: "/erbjudanden", label: "Erbjudanden" },
  { id: "salj", href: "/salj", label: "Sälj" },
  { id: "mina-kort", href: "/mina-kort", label: "Mina kort" },
];

export function AppFrame({
  title,
  user,
  tab,
  backHref,
  children,
}: {
  title: string;
  user?: SessionUser;
  tab?: Tab;
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <header className="appbar">
        {backHref && (
          <Link className="back" href={backHref} aria-label="Tillbaka">
            ←
          </Link>
        )}
        <h1>{title}</h1>
        {user && (
          <div className="who">
            {user.firstName} {user.lastName}
            <form action={logOutAction}>
              <button className="linkbtn" type="submit">
                Logga ut
              </button>
            </form>
          </div>
        )}
      </header>
      <main className="screen">{children}</main>
      {user && (
        <nav className="tabs" aria-label="Huvudmeny">
          {tabs.map((t) => (
            <Link key={t.id} href={t.href} aria-current={t.id === tab ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
