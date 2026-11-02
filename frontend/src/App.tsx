import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, onBackendFailure } from "./api";
import { I18nProvider, useI18n } from "./i18n";
import { Icon, type IconName } from "./icons";
import { BootScreen, FailedScreen } from "./screens/Boot";
import { HomeScreen } from "./screens/Home";
import { LibraryScreen } from "./screens/Library";
import { PlacementTestView } from "./screens/Placement";
import { SettingsScreen, type SettingsTab } from "./screens/Settings";
import { SetupScreen } from "./screens/Setup";
import { StudyScreen, type StudyTarget } from "./screens/Study";
import type {
  AppSettings,
  Lang,
  Levels,
  Placement,
  PlacementTest,
  Profile,
  ResourceSkill,
} from "./types";

type Phase =
  | { kind: "booting" }
  | { kind: "failed"; message: string }
  | { kind: "setup" }
  | { kind: "ready"; profile: Profile; levels: Levels | null; settings: AppSettings };

type Page =
  | { kind: "home" }
  | { kind: "library"; skill?: ResourceSkill }
  | { kind: "settings"; tab?: SettingsTab }
  | { kind: "study"; study: StudyTarget; back: Page }
  | { kind: "test"; test: PlacementTest; back: Page };

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
    const [levels, settings] = await Promise.all([api.levels(), api.settings()]);
    return { kind: "ready", profile, levels, settings };
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_profile") return { kind: "setup" };
    throw e;
  }
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" });
  const [lang, setLang] = useState<Lang>("ar");
  const [page, setPage] = useState<Page>({ kind: "home" });
  const [placements, setPlacements] = useState<Placement[]>([]);
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
    setPage({ kind: "home" });
    setPhase(next);
  };

  const refreshLevels = async () => {
    if (phase.kind !== "ready") return;
    const levels = await api.levels();
    setPhase((p) => (p.kind === "ready" ? { ...p, levels } : p));
  };

  const openTest = async (test: PlacementTest, back: Page) => {
    setPlacements(await api.placements().catch(() => []));
    setPage({ kind: "test", test, back });
  };

  return (
    <I18nProvider lang={lang}>
      <div data-testid="app-state" data-state={STATE_ATTR[phase.kind]} className="app">
        {phase.kind === "booting" && <BootScreen />}
        {phase.kind === "failed" && <FailedScreen message={phase.message} onRetry={retry} />}
        {phase.kind === "setup" && (
          <SetupScreen lang={lang} onLangChange={setLang} onDone={() => void reloadUser()} />
        )}
        {phase.kind === "ready" && (
          <Shell page={page} onNavigate={setPage}>
            {page.kind === "home" && (
              <HomeScreen
                profile={phase.profile}
                levels={phase.levels}
                onStudy={(study) => setPage({ kind: "study", study, back: page })}
                onOpenLibrary={(skill) => setPage({ kind: "library", skill })}
                onOpenSettings={(tab) => setPage({ kind: "settings", tab })}
              />
            )}
            {page.kind === "library" && (
              <LibraryScreen
                initialFilter={page.skill}
                onStudy={(study) => setPage({ kind: "study", study, back: page })}
              />
            )}
            {page.kind === "study" && (
              <StudyScreen
                study={page.study}
                keepSignIn={phase.settings.web_keep_signin === true}
                onBack={() => setPage(page.back)}
              />
            )}
            {page.kind === "test" && (
              <PlacementTestView
                test={page.test}
                keepSignIn={phase.settings.web_keep_signin === true}
                existing={placements}
                onSaved={(p) => {
                  setPlacements((list) => [p, ...list]);
                  void refreshLevels();
                }}
                onBack={() => setPage(page.back)}
              />
            )}
            {page.kind === "settings" && (
              <SettingsScreen
                key={page.tab ?? "profile"}
                profile={phase.profile}
                levels={phase.levels}
                settings={phase.settings}
                initialTab={page.tab}
                onProfileSaved={(profile) => {
                  setLang(profile.interface_language);
                  setPhase({ ...phase, profile });
                }}
                onLevelsChanged={(levels) => setPhase({ ...phase, levels })}
                onSettingsChanged={(settings) => setPhase({ ...phase, settings })}
                onDataReplaced={reloadUser}
                onOpenTest={(test) => void openTest(test, { kind: "settings", tab: "levels" })}
                onOpenSite={(study) =>
                  setPage({ kind: "study", study, back: { kind: "settings", tab: "accounts" } })
                }
              />
            )}
          </Shell>
        )}
      </div>
    </I18nProvider>
  );
}

const NAV: { kind: "home" | "library" | "settings"; icon: IconName }[] = [
  { kind: "home", icon: "home" },
  { kind: "library", icon: "library" },
  { kind: "settings", icon: "settings" },
];

function Shell(props: { page: Page; onNavigate: (p: Page) => void; children: React.ReactNode }) {
  const { t } = useI18n();
  const fixed = props.page.kind === "study" || props.page.kind === "test";
  return (
    <div className="shell">
      <nav className="topbar">
        <span className="brand">
          <span className="brand-mark">
            <Icon name="logo" color="#FFFFFF" size={18} strokeWidth={2.2} />
          </span>
          <span dir="ltr">{t("app_name")}</span>
        </span>
        {NAV.map((item) => {
          const active = props.page.kind === item.kind;
          return (
            <button
              key={item.kind}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => props.onNavigate({ kind: item.kind })}
            >
              <Icon name={item.icon} size={16} />
              {t(`nav_${item.kind}`)}
            </button>
          );
        })}
        {props.page.kind === "study" && props.page.study.timer && (
          <span className="pill pill-live">
            <span className="live-dot" aria-hidden="true" />
            {t("nav_studying")}
          </span>
        )}
      </nav>
      <main className={fixed ? "main-fixed" : "main-scroll"}>{props.children}</main>
    </div>
  );
}
