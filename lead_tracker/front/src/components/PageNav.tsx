import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/history', label: 'History' },
  { to: '/stats', label: 'Stats' },
];

export function PageNav() {
  const location = useLocation();

  return (
    <nav className="mt-4 flex items-center justify-center gap-3 text-xs">
      {LINKS.map((link) => {
        const isActive = location.pathname === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`rounded-md border px-3 py-1 tracking-wide uppercase ${
              isActive ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
