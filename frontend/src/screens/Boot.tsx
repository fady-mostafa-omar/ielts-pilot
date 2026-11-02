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

export function FailedScreen(props: {
  message: string;
  onRetry: () => Promise<void>;
  onRestoreCompatible: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const bridge = window.ipBridge;
  const newerDb = props.message.includes("[newer_db]");
  const noBackup = props.message.includes("[no_compatible_backup]");
  const message = props.message.replace(/\[(newer_db|no_compatible_backup)\]\s*/, "");
  return (
    <div className="center-screen">
      <h1 className="title-error">{newerDb ? t("newer_db_title") : t("boot_failed_title")}</h1>
      <p className="error-box" dir="ltr">
        {message}
      </p>
      {newerDb ? (
        <div className="stack" style={{ maxWidth: 560 }}>
          <p>{t("newer_db_body")}</p>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onRestoreCompatible();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("newer_db_restore")}
          </button>
        </div>
      ) : noBackup ? (
        <p className="muted">{t("no_backup_body")}</p>
      ) : (
        <p className="muted">{t("boot_failed_hint")}</p>
      )}
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
