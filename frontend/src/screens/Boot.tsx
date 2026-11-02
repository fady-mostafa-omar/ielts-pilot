import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export function BootScreen() {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="center-screen">
      <div className="spinner" aria-hidden="true" />
      <p className="lead">{t("boot_starting")}</p>
      {slow && <p className="muted">{t("boot_slow")}</p>}
    </div>
  );
}

export function FailedScreen(props: { message: string; onRetry: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const bridge = window.ipBridge;
  return (
    <div className="center-screen">
      <h1 className="title-error">{t("boot_failed_title")}</h1>
      <p className="error-box" dir="ltr">
        {props.message}
      </p>
      <p className="muted">{t("boot_failed_hint")}</p>
      <div className="row">
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await props.onRetry();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("retry")}
        </button>
        {bridge && (
          <button className="btn" onClick={() => void bridge.openFolder("data")}>
            {t("open_data_folder")}
          </button>
        )}
      </div>
    </div>
  );
}
