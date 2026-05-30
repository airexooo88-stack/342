import type { DifficultyId } from './Config';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GameSettings {
  sensitivity: number; // mouse sensitivity multiplier
  fov: number; // vertical FOV in degrees
  masterVolume: number; // 0..1
  graphics: GraphicsQuality;
  bloom: boolean;
  shadows: boolean;
  difficulty: DifficultyId;
}

const STORAGE_KEY = 'cobp.settings.v1';

const DEFAULTS: GameSettings = {
  sensitivity: 1.0,
  fov: 90,
  masterVolume: 0.7,
  graphics: 'high',
  bloom: true,
  shadows: true,
  difficulty: 'normal',
};

/**
 * Settings store with localStorage persistence and a tiny pub/sub so the
 * renderer / audio can react to live changes from the menu.
 */
class SettingsStore {
  private data: GameSettings;
  private listeners = new Set<(s: GameSettings) => void>();

  constructor() {
    this.data = this.load();
  }

  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* ignore corrupt storage */
    }
    return { ...DEFAULTS };
  }

  get(): Readonly<GameSettings> {
    return this.data;
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    this.data[key] = value;
    this.persist();
    this.emit();
  }

  patch(partial: Partial<GameSettings>) {
    Object.assign(this.data, partial);
    this.persist();
    this.emit();
  }

  reset() {
    this.data = { ...DEFAULTS };
    this.persist();
    this.emit();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable; ignore */
    }
  }

  onChange(fn: (s: GameSettings) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.data);
  }
}

export const Settings = new SettingsStore();
