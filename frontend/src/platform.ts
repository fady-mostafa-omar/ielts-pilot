// v0.0.15 (D-046): the same app on Windows and Linux; a few hints name keys or settings
// that differ (screenshots, voice typing, the microphone).
export const LINUX = typeof navigator !== "undefined" && /Linux/.test(navigator.userAgent);
