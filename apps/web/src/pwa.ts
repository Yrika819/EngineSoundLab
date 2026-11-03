/**
 * Offline shell registration for static GitHub Pages deployment.
 * WebAudio still requires a user gesture; a service worker never starts audio.
 * All state is public static content; no user input/telemetry is persisted.
 */
export async function registerOfflineApp(report: (message: string) => void): Promise<void> {
  if (!import.meta.env.PROD) {
    report("PWA：公開版で利用可能");
    return;
  }
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    report("PWA：このブラウザでは利用不可");
    return;
  }
  try {
    // Scope deliberately relative to this website, never the github.io origin root.
    const scopeUrl = new URL("./", document.baseURI);
    const script = new URL("sw.js", scopeUrl);
    const registration = await navigator.serviceWorker.register(script.href, {
      scope: scopeUrl.pathname,
      updateViaCache: "none"
    });
    const refreshStatus = () => {
      if (registration.waiting) {
        report("更新あり：アプリを閉じて再起動");
      } else if (!navigator.onLine) {
        report(registration.active ? "オフライン：保存済み" : "オフライン：準備未完了");
      } else {
        report(registration.active ? "オフライン対応済み" : "オフライン準備中");
      }
    };
    window.addEventListener("online", refreshStatus);
    window.addEventListener("offline", refreshStatus);
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", refreshStatus);
      refreshStatus();
    });
    refreshStatus();
    await navigator.serviceWorker.ready;
    refreshStatus();
  } catch (error) {
    console.warn("Offline cache unavailable; online simulator remains functional", error);
    report("オフライン保存に失敗");
  }
}
