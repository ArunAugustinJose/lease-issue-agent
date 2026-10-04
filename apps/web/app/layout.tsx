import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import './globals.css';
export const metadata: Metadata = {
  title: 'Marina Crest · Owner workspace',
  description: 'Lease review and property condition, connected by unit.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Building2 size={22} />
            </span>
            <span>
              MARINA CREST<small>Owner workspace</small>
            </span>
          </Link>
          <div className="topbar-right">
            <span className="demo-dot" />
            Stub demo · Human review required
          </div>
        </header>
        <main id="main">{children}</main>
        <footer>
          Marina Crest Holdings W.L.L.
          <span>Evidence first. Owner confirmed.</span>
        </footer>
      </body>
    </html>
  );
}
