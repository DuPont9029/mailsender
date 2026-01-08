"use client";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

type Template = {
  id: number;
  name: string;
  subject: string;
  body: string;
  placeholders: string | null;
  toEmail?: string;
  toName?: string | null;
  color?: string | null;
};

export default function TemplatesPage() {
  const { data: session, status } = useSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: "",
    placeholders: "",
    toEmail: "",
    toName: "",
    color: "",
  });
  const colors = [
    "bg-rose-50 border-rose-200 hover:bg-rose-100",
    "bg-sky-50 border-sky-200 hover:bg-sky-100",
    "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    "bg-amber-50 border-amber-200 hover:bg-amber-100",
    "bg-violet-50 border-violet-200 hover:bg-violet-100",
    "bg-cyan-50 border-cyan-200 hover:bg-cyan-100",
  ];

  useEffect(() => {
    (async () => {
      if (status !== "authenticated") return;
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
      else if (data.parquetBase64) {
        // Client-side read via duckdb-wasm
        // Lazy import to avoid SSR
        const { readTemplatesFromParquetBuffer } = await import("@/lib/duck");
        const base = await readTemplatesFromParquetBuffer(data.parquetBase64);
        type Overlay = {
          additions?: Array<Partial<Template> & { id: number | string }>;
          deletions?: Array<number | string>;
          updates?: Array<{ id: number | string; color: string | null }>;
        };
        const overlay: Overlay = (data.overlay as Overlay) || { additions: [], deletions: [], updates: [] };
        const colorsMap: Record<string, string | null> = (data.colors as Record<string, string | null>) || {};
        const deletedIds = new Set((overlay.deletions ?? []).map((x) => Number(x)));
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
          (t) => !deletedIds.has(Number(t.id)) && !additionIds.has(Number(t.id))
        );
        let merged: Template[] = [...filtered, ...additions];
        const updates = (overlay.updates ?? []).map((u) => ({ id: Number(u.id), color: u.color ?? null }));
        if (updates.length) {
          const map = new Map<number, string | null>();
          for (const u of updates) map.set(u.id, u.color);
          merged = merged.map((m) => (map.has(m.id) ? { ...m, color: map.get(m.id) ?? null } : m));
        }
        // Applica colori globali
        const withColors = merged.map((m) => {
          const key = String(m.id);
          if (Object.prototype.hasOwnProperty.call(colorsMap, key)) {
            return { ...m, color: colorsMap[key] };
          }
          return m;
        });
        setTemplates(withColors);
      } else setError("Impossibile caricare templates");
    })();
  }, [status]);

  if (status === "loading") return <div>Caricamento…</div>;
  if (!session)
    return (
      <div className="p-6 max-w-sm mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Accesso richiesto</h1>
        <p className="text-slate-700">Sei disconnesso, accedi per continuare.</p>
        <button
          className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 w-full"
          onClick={() => signIn("google")}
        >
          Accedi con Google
        </button>
      </div>
    );

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Mail predefinite</h1>
        <button
          className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-sm"
          onClick={() => signOut()}
        >
          Esci
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="mb-6">
        <button
          className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 w-full sm:w-auto"
          onClick={() => setShowCreate((s) => !s)}
        >
          {showCreate ? "Chiudi" : "Aggiungi template"}
        </button>
        {showCreate && (
          <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700">Nome</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Colore (classe Tailwind)</span>
                <select
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                >
                  <option value="">Auto</option>
                  <option value="bg-rose-50 border-rose-200 hover:bg-rose-100">Rosa</option>
                  <option value="bg-sky-50 border-sky-200 hover:bg-sky-100">Azzurro</option>
                  <option value="bg-emerald-50 border-emerald-200 hover:bg-emerald-100">Verde</option>
                  <option value="bg-amber-50 border-amber-200 hover:bg-amber-100">Ambra</option>
                  <option value="bg-violet-50 border-violet-200 hover:bg-violet-100">Viola</option>
                  <option value="bg-cyan-50 border-cyan-200 hover:bg-cyan-100">Ciano</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Destinatario Email</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.toEmail}
                  onChange={(e) => setForm((f) => ({ ...f, toEmail: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Destinatario Nome (opz.)</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.toName}
                  onChange={(e) => setForm((f) => ({ ...f, toName: e.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">Oggetto</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">Corpo (HTML consentito)</span>
                <textarea
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white h-32"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-700">Segnaposti (virgole)</span>
                <input
                  className="mt-1 border border-gray-300 rounded p-2 w-full bg-white"
                  value={form.placeholders}
                  onChange={(e) => setForm((f) => ({ ...f, placeholders: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                disabled={creating || !form.name || !form.subject || !form.body || !form.toEmail}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50"
                onClick={async () => {
                  setCreating(true);
                  try {
                    const res = await fetch("/api/templates", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: form.name,
                        subject: form.subject,
                        body: form.body,
                        placeholders: form.placeholders,
                        toEmail: form.toEmail,
                        toName: form.toName,
                        color: form.color || undefined,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.template) {
                      setTemplates((ts) => [...ts, data.template]);
                      setForm({ name: "", subject: "", body: "", placeholders: "", toEmail: "", toName: "", color: "" });
                      setShowCreate(false);
                    }
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                Crea
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((t, i) => {
          const idNum = Number(t.id);
          const idx = Number.isFinite(idNum) ? idNum : i;
          const colorClass = t.color || colors[idx % colors.length];
          return (
            <Link
              key={t.id}
              href={`/templates/${t.id}`}
              className={`block border p-4 rounded-lg shadow-sm transition-colors active:scale-[0.98] ${colorClass}`}
            >
              <h2 className="font-semibold text-slate-900">{t.name}</h2>
              <p className="text-sm text-slate-700 mt-1">{t.subject}</p>
            </Link>
          );
        })}
      </div>
      </div>
    </div>
  );
}