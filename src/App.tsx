import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Gauge, Wallet } from 'lucide-react';
import Portfolio from './pages/Portfolio';
import Topups from './pages/Topups';

const tabs = [
  { to: '/portfolio', label: 'Portfolio', icon: Gauge },
  { to: '/topups', label: 'Top-ups', icon: Wallet },
];

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">Meta Credit Tower</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Utilisation, exposure and wallet top-ups across the ads credit programme
          </p>
          <nav className="mt-4 flex gap-1">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<Navigate to="/portfolio" replace />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/topups" element={<Topups />} />
        </Routes>
      </main>
    </div>
  );
}
