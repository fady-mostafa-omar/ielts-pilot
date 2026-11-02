import { useEffect, useState } from "react";
import { api, type Health, type StoredValue } from "./api";

type BackendState = "loading" | "ok" | "error";

export function App() {
  const [state, setState] = useState<BackendState>("loading");
  const [health, setHealth] = useState<Health | null>(null);
  const [stored, setStored] = useState<StoredValue | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.health(), api.getValue()])
      .then(([h, v]) => {
        setHealth(h);
        setStored(v);
        setState("ok");
      })
      .catch((e: unknown) => {
        setError(String(e));
        setState("error");
      });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      setStored(await api.putValue(draft));
      setDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <header>
        <h1>IELTS Pilot</h1>
        <p className="muted">تجربة التغليف (Packaging spike) — نسخة تجريبية هتتشال</p>
      </header>

      <section className="card">
        <h2>حالة الـ backend</h2>
        <p>
          <span className={`dot dot-${state}`} />
          <span data-testid="backend-status" data-state={state}>
            {state === "loading" && "بيتصل…"}
            {state === "ok" && "شغال"}
            {state === "error" && "مش شغال"}
          </span>
        </p>
        {health && (
          <dl>
            <dt>الإصدار</dt>
            <dd dir="ltr">{health.version}</dd>
            <dt>نسخة قاعدة البيانات</dt>
            <dd dir="ltr">{health.schema_revision}</dd>
            <dt>مكان البيانات</dt>
            <dd dir="ltr" className="path">{health.data_dir}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>اختبار الحفظ</h2>
        <p className="muted">اكتب أي حاجة واحفظها، اقفل البرنامج وافتحه تاني — لازم تلاقيها.</p>
        <p>
          القيمة المحفوظة:{" "}
          <strong data-testid="stored-value">{stored?.value ?? "— لسه مفيش —"}</strong>
        </p>
        <div className="row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="اكتب هنا"
            disabled={state !== "ok"}
          />
          <button onClick={save} disabled={state !== "ok" || saving || draft.trim() === ""}>
            {saving ? "بيحفظ…" : "احفظ"}
          </button>
        </div>
      </section>

      {error && (
        <p className="error" role="alert" dir="ltr">
          {error}
        </p>
      )}
    </main>
  );
}
