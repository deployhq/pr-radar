import type { Platform } from '@/shared/types';

interface PlatformIconProps {
  platform: Platform;
  size?: number;
  className?: string;
}

export default function PlatformIcon({ platform, size = 20, className = '' }: PlatformIconProps) {
  switch (platform) {
    case 'github':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
        </svg>
      );
    case 'gitlab':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="m23.546 10.93-.963-2.636-1.89-5.15a.455.455 0 0 0-.864 0l-1.89 5.15H6.061l-1.89-5.15a.454.454 0 0 0-.863 0l-1.89 5.15L.454 10.93a.896.896 0 0 0 .326 1.003l11.22 8.153 11.22-8.153a.896.896 0 0 0 .326-1.003" />
        </svg>
      );
    case 'bitbucket':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M.778 1.211a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.9zM14.52 15.53H9.522L8.17 8.466h7.561z" />
        </svg>
      );
  }
}
