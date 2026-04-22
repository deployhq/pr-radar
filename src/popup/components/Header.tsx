import type { AppView } from '@/shared/types';
import type { ThemeMode } from '@/shared/storage';

interface HeaderProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
}

export default function Header({ view, onNavigate, theme, onThemeToggle }: HeaderProps) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const showBack = view.type === 'settings' || view.type === 'repos';
  const title = view.type === 'settings' ? 'Settings' : view.type === 'repos' ? 'Watched Repos' : 'PR Radar';

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        {showBack ? (
          <button
            onClick={() => onNavigate({ type: 'dashboard', tab: 'mine' })}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-1"
            aria-label="Back to dashboard"
          >
            &larr;
          </button>
        ) : (
          <img src={chrome.runtime.getURL('icons/icon-48.png')} alt="PR Radar" className="w-5 h-5 rounded" />
        )}
        <span className="font-bold text-[15px] text-gray-900 dark:text-gray-100">{title}</span>
        {!showBack && (
          <a
            href="https://www.deployhq.com/?utm_source=pr-radar&utm_medium=chrome-extension&utm_campaign=header"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-400 dark:text-gray-500 visited:text-gray-400 dark:visited:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 font-normal transition-colors"
          >by DeployHQ</a>
        )}
      </div>
      {!showBack && (
        <div className="flex items-center gap-3">
          <button
            onClick={onThemeToggle}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm w-4 h-4 flex items-center justify-center"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '\u2600\uFE0E' : '\u263D'}
          </button>
          <button
            onClick={() => onNavigate({ type: 'repos' })}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            title="Watched repos"
            aria-label="Watched repos"
          >
            &#9776;
          </button>
          <button
            onClick={() => onNavigate({ type: 'settings' })}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            title="Settings"
            aria-label="Settings"
          >
            &#9881;
          </button>
        </div>
      )}
    </div>
  );
}
