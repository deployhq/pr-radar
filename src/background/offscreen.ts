// Offscreen document for playing notification sounds
// Service workers can't play audio directly in Manifest V3

const SOUNDS: Record<string, string> = {
  ding: 'sounds/ding.mp3',
  bell: 'sounds/bell.mp3',
  chime: 'sounds/chime.mp3',
};

chrome.runtime.onMessage.addListener((message: { type: string; soundId?: string }) => {
  if (message.type === 'PLAY_SOUND' && message.soundId) {
    const src = SOUNDS[message.soundId];
    if (src) {
      const audio = new Audio(chrome.runtime.getURL(src));
      audio.volume = 0.7;
      audio.play().catch(console.error);
    }
  }
});
