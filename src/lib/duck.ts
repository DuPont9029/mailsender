import { AsyncDuckDB, selectBundle } from "@duckdb/duckdb-wasm";

let dbPromise: Promise<AsyncDuckDB> | null = null;

export async function getDuckDB() {
  if (!dbPromise) {
    const bundle = await selectBundle({
      mvp: {
        mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm",
        mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js",
      },
      eh: {
        mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm",
        mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js",
      },
    });
    let worker: Worker | null = null;
    if (bundle.mainWorker) {
      if (/^https?:\/\//.test(bundle.mainWorker)) {
        const resp = await fetch(bundle.mainWorker);
        const code = await resp.text();
        const blob = new Blob([code], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        worker = new Worker(url);
      } else {
        worker = new Worker(bundle.mainWorker);
      }
    }
    const logger = console;
    const db = new AsyncDuckDB(logger, worker);
    let pthreadUrl: string | null = bundle.pthreadWorker ?? null;
    if (pthreadUrl && /^https?:\/\//.test(pthreadUrl)) {
      const resp = await fetch(pthreadUrl);
      const code = await resp.text();
      const blob = new Blob([code], { type: "application/javascript" });
      pthreadUrl = URL.createObjectURL(blob);
    }
    await db.instantiate(bundle.mainModule, pthreadUrl);
    await db.open({});
    dbPromise = Promise.resolve(db);
  }
  return dbPromise!;
}

export async function readTemplatesFromParquet(url: string) {
  const db = await getDuckDB();
  const conn = await db.connect();
  // Use httpfs to read remote parquet via presigned URL
  await conn.query("INSTALL httpfs; LOAD httpfs;");
  const result = await conn.query(
    `SELECT 
       id, 
       name, 
       subject, 
       body, 
       placeholders, 
       recipient_email AS toEmail, 
       recipient_name AS toName 
     FROM read_parquet('${url}')`,
  );
  await conn.close();
  const rows = result.toArray();
  interface Row {
    id: number | string;
    name: unknown;
    subject: unknown;
    body: unknown;
    placeholders: unknown;
    toEmail: unknown;
    toName: unknown;
  }
  return rows.map((row: Row) => ({
    id: Number(row.id),
    name: String(row.name),
    subject: String(row.subject),
    body: String(row.body),
    placeholders: (row.placeholders as string | null) ?? null,
    toEmail: String(row.toEmail),
    toName: (row.toName as string | null) ?? null,
  }));
}