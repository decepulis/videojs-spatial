import { selectTime } from '@videojs/react';

type Time = ReturnType<typeof selectTime>;

export function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** How far through the media playback is, 0–1. */
export function playedRatio(time: Time): number {
  return time && time.duration > 0 ? clamp(time.currentTime / time.duration) : 0;
}

export function seekToRatio(time: Time, ratio: number): void {
  if (!time || !(time.duration > 0)) return;

  void time.seek(clamp(ratio) * time.duration);
}
