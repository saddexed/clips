import Link from 'next/link';
import { LayoutDashboard, ListVideo, Upload, Activity, Home, History, LogOut, Settings } from 'lucide-react';
import '../globals.css';
import { GlobalUploadProvider } from '@/components/GlobalUploadProvider';
import WorkerStatusBadge from '@/components/WorkerStatusBadge';

export const metadata = {
  title: 'Clips Admin',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlobalUploadProvider>
      <div className="container-dash">
        <div className="top-nav-container animate-in">
          <nav className="top-nav">
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--foreground)', paddingRight: '1rem', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ background: 'var(--foreground)', padding: '0.3rem', borderRadius: '0.3rem' }}>
                <LayoutDashboard size={18} color="var(--background)" />
              </div>
              <span style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.025em' }}>Clips Admin</span>
            </Link>
            
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <NavLink href="/admin" icon={<ListVideo size={16} />} label="Manage" />
              <NavLink href="/admin/tasks" icon={<Activity size={16} />} label="Queue" />
              <NavLink href="/admin/history" icon={<History size={16} />} label="History" />
              <NavLink href="/admin/settings" icon={<Settings size={16} />} label="Settings" />
            </div>

            <div style={{ paddingLeft: '1rem', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
              <WorkerStatusBadge />
            </div>
          </nav>
          <div style={{ position: 'absolute', right: '2rem', top: '1rem', display: 'flex', gap: '0.75rem', zIndex: 50, pointerEvents: 'auto' }}>
            <a href="/api/auth/logout" title="Log Out" style={{ background: 'var(--foreground)', color: 'var(--background)', padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <LogOut size={20} />
            </a>
            <Link href="/" title="Return to Main Site" style={{ background: 'var(--foreground)', color: 'var(--background)', padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <Home size={20} />
            </Link>
          </div>
        </div>
      
        <main className="main-content">
          <div className="page-container animate-in">
            {children}
          </div>
        </main>
      </div>
    </GlobalUploadProvider>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  // We'll use a simple style for unselected but in a real app we'd use usePathname from next/navigation
  return (
    <Link 
      href={href}
      className="btn-nav"
    >
      {icon}
      {label}
    </Link>
  );
}
