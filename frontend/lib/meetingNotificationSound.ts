const SOUND_PREFERENCE_KEY = "flippro-meeting-notification-sound";

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  try {
    audioContext ||= new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

export function isMeetingNotificationSoundEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export async function enableMeetingNotificationSound() {
  const context = getAudioContext();
  if (!context) return false;
  try {
    await context.resume();
    if (context.state !== "running") return false;
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, "true");
    playMeetingNotificationSound();
    return true;
  } catch {
    return false;
  }
}

export function disableMeetingNotificationSound() {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(SOUND_PREFERENCE_KEY);
  } catch {
    // The current page can still stop the sound if storage is unavailable.
  }
}

export async function unlockMeetingNotificationSound() {
  if (!isMeetingNotificationSoundEnabled()) return;
  const context = getAudioContext();
  if (context?.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // The browser may keep audio suspended until the user interacts again.
    }
  }
}

export function playMeetingNotificationSound() {
  if (!isMeetingNotificationSoundEnabled()) return;
  const context = audioContext;
  if (!context || context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(660, startAt + 0.16);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.21);
}
