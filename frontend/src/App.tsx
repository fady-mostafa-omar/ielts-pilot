import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, onBackendFailure } from "./api";
import { I18nProvider, useI18n } from "./i18n";
import { BootScreen, FailedScreen } from "./screens/Boot";
import { HomeScreen } from "./screens/Home";
import { SettingsScreen } from "./screens/Settings";
import { SetupScreen } from "./screens/Setup";
import type { Lang, Levels, Profile } from "./types";

type Phase =
  | { kind: "booting" }
  | { kind: "failed"; message: string }
  | { kind: "setup" }
  | { kind: "ready"; profile: Profile; levels: Levels | null };

type Page = "home" | "settings";

const STATE_ATTR: Record<Phase["kind"], string> = {
  booting: "booting",
  failed: "error",
  setup: "setup",
  ready: "home",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBackend(): Promise<void> {
  for (;;) {
    try {
      await api.health();
      return;
    } catch (e) {
      if (e instanceof ApiError && e.code === "backend_starting") {
        await sleep(300);
        continue;
      }
      throw e;
    }
  }
}

async function loadUser(): Promise<Phase> {
  try {
    const profile = await api.profile();
    const levels = await api.levels();
    return { kind: "ready", profile, levels };
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_profile") return { kind: "setup" };
    throw e;
  }
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" });
  const [lang, setLang] = useState<Lang>("ar");
  const [page, setPage] = useState<Page>("home");
  const started = useRef(false);

  const boot = useCallback(async () => {
    setPhase({ kind: "booting" });
    try {
      await waitForBackend();
      const next = await loadUser();
      if (next.kind === "ready") setLang(next.profile.interface_language);
      setPhase(next);
    } catch (e) {
      setPhase({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    void boot();
    return onBackendFailure((message) => setPhase({ kind: "failed", message }));
  }, [boot]);

  const retry = async () => {
    if (window.ipBridge) await window.ipBridge.restartBackend();
    await boot();
  };

  const reloadUser = async () => {
    const next = await loadUser();
    if (next.kind === "ready") setLang(next.profile.interface_language);
    setPage("home");
    setPhase(next);
  };

  return (
    <I18nProvider lang={lang}>
      <div data-testid="app-state" data-state={STATE_ATTR[phase.kind]} className="app">
        {phase.kind === "booting" && <BootScreen />}
        {phase.kind === "failed" && <FailedScreen message={phase.message} onRetry={retry} />}
        {phase.kind === "setup" && (
          <SetupScreen
            lang={lang}
            onLangChange={setLang}
            onDone={() => void reloadUser()}
          />
        )}
        {phase.kind === "ready" && (
          <Shell page={page} onNavigate={setPage}>
            {page === "home" ? (
              <HomeScreen
                profile={phase.profile}
                levels={phase.levels}
                onOpenSettings={() => setPage("settings")}
              />
            ) : (
              <SettingsScreen
                profile={phase.profile}
                levels={phase.levels}
                onProfileSaved={(profile) => {
                  setLang(profile.interface_language);
                  setPhase({ ...phase, profile });
                }}
                onLevelsChanged={(levels) => setPhase({ ...phase, levels })}
                onDataReplaced={reloadUser}
              />
            )}
          </Shell>
        )}
      </div>
    </I18nProvider>
  );
}

function Shell(props: { page: Page; onNavigate: (p: Page) => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <nav className="topbar">
        <span className="brand">{t("app_name")}</span>
        {(["home", "settings"] as const).map((p) => (
          <button
            key={p}
            className={props.page === p ? "active" : ""}
            aria-current={props.page === p ? "page" : undefined}
            onClick={() => props.onNavigate(p)}
          >
            {t(`nav_${p}`)}
          </button>
        ))}
      </nav>
      <main>{props.children}</main>
    </>
  );
}
