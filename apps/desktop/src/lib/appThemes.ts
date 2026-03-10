/**
 * App-wide UI themes. Each theme defines CSS custom property values
 * that get applied to :root to re-skin the entire app.
 */

export interface AppTheme {
  "--bg-primary": string;
  "--bg-secondary": string;
  "--bg-tertiary": string;
  "--bg-input": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-bright": string;
  "--accent": string;
  "--accent-hover": string;
  "--accent-active": string;
  "--border": string;
  "--border-focus": string;
  "--success": string;
  "--warning": string;
  "--error": string;
  "--scrollbar-thumb": string;
  "--scrollbar-thumb-hover": string;
  "--selection-bg": string;
}

export const appThemes: Record<string, AppTheme> = {
  "Tokyo Night": {
    "--bg-primary": "#13141c",
    "--bg-secondary": "#181924",
    "--bg-tertiary": "#1e1f2e",
    "--bg-input": "#252736",
    "--text-primary": "#a9b1d6",
    "--text-secondary": "#565f89",
    "--text-bright": "#c0caf5",
    "--accent": "#7aa2f7",
    "--accent-hover": "#89b4fa",
    "--accent-active": "#5d7ec7",
    "--border": "#232433",
    "--border-focus": "#7aa2f7",
    "--success": "#9ece6a",
    "--warning": "#e0af68",
    "--error": "#f7768e",
    "--scrollbar-thumb": "#2e3148",
    "--scrollbar-thumb-hover": "#3b4261",
    "--selection-bg": "rgba(122, 162, 247, 0.3)",
  },
  "One Dark": {
    "--bg-primary": "#282c34",
    "--bg-secondary": "#21252b",
    "--bg-tertiary": "#2c313a",
    "--bg-input": "#333842",
    "--text-primary": "#abb2bf",
    "--text-secondary": "#5c6370",
    "--text-bright": "#d7dae0",
    "--accent": "#61afef",
    "--accent-hover": "#74bfff",
    "--accent-active": "#4d8bc9",
    "--border": "#3e4452",
    "--border-focus": "#61afef",
    "--success": "#98c379",
    "--warning": "#e5c07b",
    "--error": "#e06c75",
    "--scrollbar-thumb": "#3e4452",
    "--scrollbar-thumb-hover": "#4b5263",
    "--selection-bg": "rgba(97, 175, 239, 0.3)",
  },
  "GitHub Dark": {
    "--bg-primary": "#0d1117",
    "--bg-secondary": "#161b22",
    "--bg-tertiary": "#1c2128",
    "--bg-input": "#21262d",
    "--text-primary": "#c9d1d9",
    "--text-secondary": "#8b949e",
    "--text-bright": "#f0f6fc",
    "--accent": "#58a6ff",
    "--accent-hover": "#79c0ff",
    "--accent-active": "#388bfd",
    "--border": "#30363d",
    "--border-focus": "#58a6ff",
    "--success": "#7ee787",
    "--warning": "#d29922",
    "--error": "#ff7b72",
    "--scrollbar-thumb": "#30363d",
    "--scrollbar-thumb-hover": "#484f58",
    "--selection-bg": "rgba(88, 166, 255, 0.3)",
  },
  "Catppuccin Mocha": {
    "--bg-primary": "#1e1e2e",
    "--bg-secondary": "#181825",
    "--bg-tertiary": "#313244",
    "--bg-input": "#45475a",
    "--text-primary": "#cdd6f4",
    "--text-secondary": "#6c7086",
    "--text-bright": "#f5f5f5",
    "--accent": "#89b4fa",
    "--accent-hover": "#b4d0fb",
    "--accent-active": "#6c99e0",
    "--border": "#313244",
    "--border-focus": "#89b4fa",
    "--success": "#a6e3a1",
    "--warning": "#f9e2af",
    "--error": "#f38ba8",
    "--scrollbar-thumb": "#45475a",
    "--scrollbar-thumb-hover": "#585b70",
    "--selection-bg": "rgba(137, 180, 250, 0.3)",
  },
  "Dracula": {
    "--bg-primary": "#282a36",
    "--bg-secondary": "#21222c",
    "--bg-tertiary": "#343746",
    "--bg-input": "#3e4154",
    "--text-primary": "#f8f8f2",
    "--text-secondary": "#6272a4",
    "--text-bright": "#ffffff",
    "--accent": "#bd93f9",
    "--accent-hover": "#caa8fb",
    "--accent-active": "#a77bf5",
    "--border": "#44475a",
    "--border-focus": "#bd93f9",
    "--success": "#50fa7b",
    "--warning": "#f1fa8c",
    "--error": "#ff5555",
    "--scrollbar-thumb": "#44475a",
    "--scrollbar-thumb-hover": "#565970",
    "--selection-bg": "rgba(189, 147, 249, 0.3)",
  },
};

export const defaultAppTheme = "Tokyo Night";

const STORAGE_KEY = "tide-app-theme";

/** Apply a theme's CSS variables to the document root. */
export function applyAppTheme(themeName: string): void {
  const theme = appThemes[themeName];
  if (!theme) return;

  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme)) {
    root.style.setProperty(prop, value);
  }
}

/** Persist the selected theme name to localStorage. */
export function saveAppTheme(themeName: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeName);
  } catch {
    // localStorage may be unavailable
  }
}

/** Load the persisted theme name from localStorage. */
export function loadAppTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || defaultAppTheme;
  } catch {
    return defaultAppTheme;
  }
}
