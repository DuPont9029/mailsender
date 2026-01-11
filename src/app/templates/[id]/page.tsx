"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";

type Template = {
  id: number;
  name: string;
  subject: string;
  body: string;
  placeholders: string | null;
  toEmail: string;
  toName: string | null;
  color?: string | null;
};

function applyPlaceholders(body: string, values: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const { status: authStatus } = useSession();
  const [template, setTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>("");
  const [confirmName, setConfirmName] = useState<string>("");
  const [deleting, setDeleting] = useState<boolean>(false);
  const [color, setColor] = useState<string>("");
  const [editToEmail, setEditToEmail] = useState<string>("");
  const [editToName, setEditToName] = useState<string>("");
  const [duplicating, setDuplicating] = useState<boolean>(false);
  const [duplicateForm, setDuplicateForm] = useState<{
    name: string;
    subject: string;
    body: string;
    placeholders: string;
    toEmail: string;
    toName: string;
    color: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      if (authStatus !== "authenticated") {
        setTemplate(null);
        setMessage("Devi autenticarti");
        return;
      }
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          setMessage(
            res.status === 401 ? "Devi autenticarti" : "Errore nel caricamento"
          );
          setTemplate(null);
          return;
        }
        const data = await res.json();
        let list: Template[] = [];
        if (data.templates) list = data.templates as Template[];
        else if (data.parquetBase64) {
          const { readTemplatesFromParquetBuffer } = await import("@/lib/duck");
          const base = await readTemplatesFromParquetBuffer(data.parquetBase64);
          type Overlay = {
            additions?: Array<Partial<Template> & { id: number | string }>;
            deletions?: Array<number | string>;
            updates?: Array<{ id: number | string; color: string | null }>;
          };
          const overlay: Overlay = (data.overlay as Overlay) || {
            additions: [],
            deletions: [],
            updates: [],
          };
          const colorsMap: Record<string, string | null> =
            (data.colors as Record<string, string | null>) || {};
          const deletedIds = new Set(
            (overlay.deletions ?? []).map((x) => Number(x))
          );
          const additions: Template[] = (overlay.additions ?? []).map((t) => ({
            id: Number(t.id),
            name: String(t.name ?? ""),
            subject: String(t.subject ?? ""),
            body: String(t.body ?? ""),
            placeholders: (t.placeholders as string | null) ?? null,
            toEmail: String(t.toEmail ?? ""),
            toName: (t.toName as string | null) ?? null,
            color: (t.color as string | null) ?? null,
          }));
          const additionIds = new Set(additions.map((t) => t.id));
          const filtered: Template[] = base.filter(
            (t) =>
              !deletedIds.has(Number(t.id)) && !additionIds.has(Number(t.id))
          );
          let merged: Template[] = [...filtered, ...additions];
          const updates = (overlay.updates ?? []).map((u) => ({
            id: Number(u.id),
            color: u.color ?? null,
          }));
          if (updates.length) {
            const map = new Map<number, string | null>();
            for (const u of updates) map.set(u.id, u.color);
            merged = merged.map((m) =>
              map.has(m.id) ? { ...m, color: map.get(m.id) ?? null } : m
            );
          }
          // Applica colori globali
          merged = merged.map((m) => {
            const key = String(m.id);
            if (Object.prototype.hasOwnProperty.call(colorsMap, key)) {
              return { ...m, color: colorsMap[key] };
            }
            return m;
          });
          list = merged;
        }
        const t = list.find((x) => Number(x.id) === id) || null;
        setTemplate(t);
        if (t?.color) setColor(t.color || "");
        if (t) {
          setEditToEmail(t.toEmail || "");
          setEditToName(t.toName || "");
        }
        if (!t) setMessage("Template non trovato");
      } catch {
        setMessage("Errore nel caricamento");
        setTemplate(null);
      }
    })();
  }, [id, authStatus]);

  const placeholderKeys = useMemo(() => {
    if (!template?.placeholders) return [] as string[];
    try {
      const arr = JSON.parse(template.placeholders) as string[];
      return arr;
    } catch {
      return [];
    }
  }, [template]);

  async function sendEmail() {
    if (!template) return;
    const subject = placeholderKeys.length
      ? applyPlaceholders(template.subject, values)
      : template.subject;
    const body = placeholderKeys.length
      ? applyPlaceholders(template.body, values)
      : template.body;
    setMessage("Invio in corso…");
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: template.toEmail, subject, body }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("Email inviata");
      setTimeout(() => router.push("/templates"), 1200);
    } else setMessage(`Errore: ${data.error || "unknown"}`);
  }

  async function deleteTemplate() {
    if (!template) return;
    if (confirmName !== template.name) {
      setMessage("Il nome non coincide, conferma per eliminare.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id, confirmName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage("Template eliminato");
        setTimeout(() => router.push("/templates"), 1000);
      } else {
        setMessage(`Errore eliminazione: ${data.error || "unknown"}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  function startDuplicate() {
    if (!template) return;
    let ph = "";
    try {
      if (template.placeholders) {
        ph = (JSON.parse(template.placeholders) as string[]).join(", ");
      }
    } catch {
      /* ignore */
    }

    setDuplicateForm({
      name: `${template.name} (Copia)`,
      subject: template.subject,
      body: template.body,
      placeholders: ph,
      toEmail: template.toEmail,
      toName: template.toName || "",
      color: template.color || "",
    });
  }

  async function submitDuplicate() {
    if (!duplicateForm) return;
    setDuplicating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicateForm),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Template duplicato con successo");
        setTimeout(() => router.push("/templates"), 1200);
      } else {
        setMessage(`Errore duplicazione: ${data.error || "unknown"}`);
      }
    } catch {
      setMessage("Errore durante la duplicazione");
    } finally {
      setDuplicating(false);
    }
  }

  if (authStatus === "loading") return <div className="p-6">Caricamento…</div>;
  if (authStatus !== "authenticated")
    return (
      <div className="p-6 max-w-sm mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Accesso richiesto</h1>
        <p className="text-slate-700">
          Sei disconnesso, accedi per continuare.
        </p>
        <button
          className="px-4 py-2 rounded border border-gray-300 bg-white hover:bg-gray-100 w-full"
          onClick={() => signIn("google")}
        >
          Accedi con Google
        </button>
      </div>
    );
  if (!template) return <div className="p-6">{message || "Caricamento…"}</div>;

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{template.name}</h1>
          <button
            className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-sm w-full sm:w-auto"
            onClick={() => signOut()}
          >
            Esci
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-sm"
            onClick={() => router.push("/templates")}
          >
            ← Torna ai template
          </button>
          <button
            className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-sm"
            onClick={startDuplicate}
          >
            Duplica
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <span className="block text-xs text-gray-600">Destinatario</span>
          <p className="mt-1 text-slate-900">
            {template.toName
              ? `${template.toName} <${template.toEmail}>`
              : template.toEmail}
          </p>
        </div>
        {placeholderKeys.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-semibold">Segnaposti</h2>
            {placeholderKeys.map((k) => (
              <label key={k} className="block">
                <span className="text-sm text-slate-700">{k}</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-3 w-full bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                  value={values[k] || ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-slate-700">
            Nessun segnaposto presente. La mail verrà inviata direttamente.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-3 bg-slate-900 text-white rounded hover:bg-slate-800 w-full sm:w-auto"
            onClick={sendEmail}
          >
            Invia
          </button>
          {message && <p className="text-sm text-slate-700">{message}</p>}
        </div>
        <div className="mt-6 border-t pt-4 space-y-3">
          <h3 className="font-semibold">Colore</h3>
          <div className="flex items-center gap-3">
            <select
              className="mt-1 border border-gray-300 rounded p-3 bg-white w-full"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            >
              <option value="">Auto</option>
              <option value="bg-rose-50 border-rose-200 hover:bg-rose-100">
                Rosa
              </option>
              <option value="bg-sky-50 border-sky-200 hover:bg-sky-100">
                Azzurro
              </option>
              <option value="bg-emerald-50 border-emerald-200 hover:bg-emerald-100">
                Verde
              </option>
              <option value="bg-amber-50 border-amber-200 hover:bg-amber-100">
                Ambra
              </option>
              <option value="bg-violet-50 border-violet-200 hover:bg-violet-100">
                Viola
              </option>
              <option value="bg-cyan-50 border-cyan-200 hover:bg-cyan-100">
                Ciano
              </option>
            </select>
            <button
              className="mt-3 px-4 py-3 bg-indigo-600 text-white rounded hover:bg-indigo-500 w-full sm:w-auto"
              onClick={async () => {
                if (!template) return;
                const res = await fetch("/api/templates", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: template.id,
                    color: color || null,
                    shadow: {
                      name: template.name,
                      subject: template.subject,
                      body: template.body,
                      placeholders: template.placeholders,
                      toEmail: template.toEmail,
                      toName: template.toName,
                    },
                  }),
                });
                if (res.ok) setMessage("Colore aggiornato");
                else {
                  const data = await res.json().catch(() => ({}));
                  setMessage(
                    `Errore aggiornamento colore: ${data.error || "unknown"}`
                  );
                }
              }}
            >
              Salva colore
            </button>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 space-y-3">
          <h3 className="font-semibold">Modifica Destinatario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-700">Email</span>
              <input
                className="mt-1 border border-gray-300 rounded p-3 bg-white w-full"
                value={editToEmail}
                onChange={(e) => setEditToEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">Nome</span>
              <input
                className="mt-1 border border-gray-300 rounded p-3 bg-white w-full"
                value={editToName}
                onChange={(e) => setEditToName(e.target.value)}
              />
            </label>
          </div>
          <button
            className="px-4 py-3 bg-indigo-600 text-white rounded hover:bg-indigo-500 w-full sm:w-auto"
            onClick={async () => {
              if (!template) return;
              const res = await fetch("/api/templates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: template.id,
                  toEmail: editToEmail,
                  toName: editToName || null,
                }),
              });
              if (res.ok) setMessage("Destinatario aggiornato");
              else {
                const data = await res.json().catch(() => ({}));
                setMessage(
                  `Errore aggiornamento destinatario: ${
                    data.error || "unknown"
                  }`
                );
              }
            }}
          >
            Salva modifiche
          </button>
        </div>
        <div className="mt-6 border-t pt-4 space-y-3">
          <h3 className="font-semibold text-red-700">Elimina template</h3>
          <p className="text-sm text-slate-700">
            Digita il nome del template (
            <span className="font-mono">{template.name}</span>) per confermare.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <input
              className="mt-1 border border-gray-300 rounded p-3 bg-white flex-1"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Nome del template"
            />
            <button
              disabled={deleting || confirmName !== template.name}
              className="px-4 py-3 bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50 w-full sm:w-auto"
              onClick={deleteTemplate}
            >
              Elimina
            </button>
          </div>
        </div>
      </div>
      {duplicateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full my-8">
            <h2 className="text-xl font-bold mb-4">Duplica Template</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700">Nome</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.name}
                  onChange={(e) =>
                    setDuplicateForm({ ...duplicateForm, name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Colore</span>
                <select
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.color}
                  onChange={(e) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      color: e.target.value,
                    })
                  }
                >
                  <option value="">Auto</option>
                  <option value="bg-rose-50 border-rose-200 hover:bg-rose-100">
                    Rosa
                  </option>
                  <option value="bg-sky-50 border-sky-200 hover:bg-sky-100">
                    Azzurro
                  </option>
                  <option value="bg-emerald-50 border-emerald-200 hover:bg-emerald-100">
                    Verde
                  </option>
                  <option value="bg-amber-50 border-amber-200 hover:bg-amber-100">
                    Ambra
                  </option>
                  <option value="bg-violet-50 border-violet-200 hover:bg-violet-100">
                    Viola
                  </option>
                  <option value="bg-cyan-50 border-cyan-200 hover:bg-cyan-100">
                    Ciano
                  </option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">
                  Destinatario Email
                </span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.toEmail}
                  onChange={(e) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      toEmail: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">
                  Destinatario Nome
                </span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.toName}
                  onChange={(e) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      toName: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">Oggetto</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.subject}
                  onChange={(e) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      subject: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">
                  Corpo (HTML consentito)
                </span>
                <textarea
                  className="mt-1 border border-gray-300 rounded p-2 w-full h-32"
                  value={duplicateForm.body}
                  onChange={(e) =>
                    setDuplicateForm({ ...duplicateForm, body: e.target.value })
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">
                  Segnaposti (virgole)
                </span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full"
                  value={duplicateForm.placeholders}
                  onChange={(e) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      placeholders: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                onClick={() => setDuplicateForm(null)}
              >
                Annulla
              </button>
              <button
                disabled={
                  duplicating ||
                  !duplicateForm.name ||
                  !duplicateForm.subject ||
                  !duplicateForm.body ||
                  !duplicateForm.toEmail
                }
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50"
                onClick={submitDuplicate}
              >
                {duplicating ? "Salvataggio..." : "Salva copia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
