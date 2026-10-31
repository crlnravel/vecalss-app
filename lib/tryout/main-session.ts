const MAIN_TRYOUT_SESSION_NAME = "Sesi utama";
const DEFAULT_MAIN_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function defaultMainSessionWindow(now = new Date()) {
  return {
    availableFrom: now,
    availableUntil: new Date(now.getTime() + DEFAULT_MAIN_SESSION_WINDOW_MS),
  };
}

export {
  DEFAULT_MAIN_SESSION_WINDOW_MS,
  MAIN_TRYOUT_SESSION_NAME,
  defaultMainSessionWindow,
};
