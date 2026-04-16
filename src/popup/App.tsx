import { useState, useEffect } from 'react';
import type { AppView } from '@/shared/types';
import { getAccounts } from '@/shared/storage';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Repos from './pages/Repos';
import Header from './components/Header';

export default function App() {
  const [view, setView] = useState<AppView | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);

  useEffect(() => {
    async function init() {
      const accounts = await getAccounts();
      setHasAccounts(accounts.length > 0);
      if (accounts.length === 0) {
        setView({ type: 'setup' });
      } else {
        setView({ type: 'dashboard', tab: 'mine' });
      }
      setLoading(false);
    }
    init();
  }, []);

  // Re-check accounts when navigating (e.g. after connecting a new one)
  useEffect(() => {
    if (view) {
      getAccounts().then((a) => setHasAccounts(a.length > 0));
    }
  }, [view]);

  if (loading || !view) {
    return (
      <div className="flex items-center justify-center h-[520px] bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-radar-500 border-t-transparent" />
      </div>
    );
  }

  // Show header on Setup only when user navigated there from Settings (has existing accounts)
  const showHeader = view.type !== 'setup' || hasAccounts;

  return (
    <div className="min-h-[520px] flex flex-col bg-gray-950 text-gray-200 rounded-xl overflow-hidden">
      {showHeader && <Header view={view} onNavigate={setView} />}
      <div className="flex-1 overflow-y-auto">
        {view.type === 'setup' && (
          <Setup onComplete={() => setView({ type: 'dashboard', tab: 'mine' })} />
        )}
        {view.type === 'dashboard' && (
          <Dashboard tab={view.tab ?? 'mine'} onNavigate={setView} />
        )}
        {view.type === 'settings' && <Settings onNavigate={setView} />}
        {view.type === 'repos' && <Repos />}
      </div>
      <footer className="flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-800 text-[11px] text-gray-500">
        Made with &lt;3 by{' '}
        <a
          href="https://www.deployhq.com/?utm_source=pr-radar&utm_medium=chrome-extension&utm_campaign=footer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-radar-400 visited:text-radar-400 hover:underline"
        >
          DeployHQ
        </a>
      </footer>
    </div>
  );
}
