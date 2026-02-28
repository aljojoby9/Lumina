import { AppSettings } from '../types';

const SETTINGS_KEY = 'lumina_app_settings_v1';

export const defaultAppSettings: AppSettings = {
  theme: 'dark',
  defaultExportFormat: 'mp4',
};

export const getAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultAppSettings;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      defaultExportFormat: parsed.defaultExportFormat || defaultAppSettings.defaultExportFormat,
    };
  } catch {
    return defaultAppSettings;
  }
};

export const saveAppSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};
