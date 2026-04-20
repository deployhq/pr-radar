interface KeyboardShortcutsProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['j', '↓'], action: 'Next PR' },
  { keys: ['k', '↑'], action: 'Previous PR' },
  { keys: ['o', '⏎'], action: 'Open PR' },
  { keys: ['/'], action: 'Search' },
  { keys: ['r'], action: 'Refresh' },
  { keys: ['1', '2', '3'], action: 'Switch tab' },
  { keys: ['Esc'], action: 'Clear / dismiss' },
  { keys: ['?'], action: 'This help' },
];

export default function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4 w-[280px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs"
            aria-label="Close shortcuts"
          >
            &#10005;
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex items-center justify-between">
              <span className="text-[12px] text-gray-400">{s.action}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((key, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-[10px] text-gray-600 mx-0.5">/</span>}
                    <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-gray-300 font-mono">
                      {key}
                    </kbd>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
