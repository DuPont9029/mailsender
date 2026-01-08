import { NextResponse } from "next/server";
import {
  TEMPLATES_OVERLAY,
  TEMPLATES_PARQUET,
  TEMPLATES_COLORS,
  getJsonFromS3,
  putJsonToS3,
  getUserOverlayKey,
  getFileBufferFromS3,
} from "@/lib/s3";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type Template = {
  id: number;
  name: string;
  subject: string;
  body: string;
  placeholders: string | null;
  toEmail: string;
  toName: string | null;
  color?: string | null;
  owner?: string | null;
};

type Overlay = {
  additions: Template[];
  deletions?: number[];
  updates?: { id: number; color?: string | null }[];
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const overlayKey = getUserOverlayKey(session.user?.email);
  try {
    // Carica overlay per-utente (e migra se necessario)
    const overlay = (await getJsonFromS3<Overlay>(
      TEMPLATES_OVERLAY.bucket,
      overlayKey
    )) || {
      additions: [],
      deletions: [],
      updates: [],
    };
    // Migrazione: overlay anonimo -> utente
    const anonKey = getUserOverlayKey(null);
    const anonOverlay = await getJsonFromS3<Overlay>(
      TEMPLATES_OVERLAY.bucket,
      anonKey
    );
    if (
      anonOverlay &&
      Array.isArray(anonOverlay.additions) &&
      anonOverlay.additions.length
    ) {
      const migrated = (anonOverlay.additions || []).map((t) => ({
        ...t,
        owner: session.user?.email || null,
      }));
      overlay.additions = [...(overlay.additions || []), ...migrated];
      await putJsonToS3(TEMPLATES_OVERLAY.bucket, overlayKey, overlay);
      anonOverlay.additions = [];
      await putJsonToS3(TEMPLATES_OVERLAY.bucket, anonKey, anonOverlay);
    }
    // Migrazione legacy: dal file condiviso base alla chiave utente
    const legacyOverlay = await getJsonFromS3<Overlay>(
      TEMPLATES_OVERLAY.bucket,
      TEMPLATES_OVERLAY.key
    );
    if (
      legacyOverlay &&
      Array.isArray(legacyOverlay.additions) &&
      legacyOverlay.additions.length
    ) {
      const migratedLegacy = (legacyOverlay.additions || []).map((t) => ({
        ...t,
        owner: session.user?.email || null,
      }));
      overlay.additions = [...(overlay.additions || []), ...migratedLegacy];
      await putJsonToS3(TEMPLATES_OVERLAY.bucket, overlayKey, overlay);
      legacyOverlay.additions = [];
      await putJsonToS3(
        TEMPLATES_OVERLAY.bucket,
        TEMPLATES_OVERLAY.key,
        legacyOverlay
      );
    }

    // Get parquet buffer instead of presigned URL
    const parquetBuffer = await getFileBufferFromS3(
      TEMPLATES_PARQUET.bucket,
      TEMPLATES_PARQUET.key
    );
    const parquetBase64 = parquetBuffer
      ? Buffer.from(parquetBuffer).toString("base64")
      : null;

    // Colori globali
    const colors =
      (await getJsonFromS3<Record<string, string | null>>(
        TEMPLATES_COLORS.bucket,
        TEMPLATES_COLORS.key
      )) || {};

    return NextResponse.json({ parquetBase64, overlay, colors });
  } catch (e) {
    console.error("Templates API Error:", e);
    return NextResponse.json(
      { error: "load_failed", details: String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const overlayKey = getUserOverlayKey(session.user?.email);
  const body = await req.json();
  const {
    name,
    subject,
    body: content,
    placeholders,
    toEmail,
    toName,
    color,
  } = body || {};
  if (!name || !subject || !content || !toEmail)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  let placeholdersStr: string | null = null;
  if (Array.isArray(placeholders)) {
    try {
      placeholdersStr = JSON.stringify(placeholders);
    } catch {
      placeholdersStr = null;
    }
  } else if (typeof placeholders === "string") {
    const arr = placeholders
      .split(",")
      .map((x: string) => x.trim())
      .filter(Boolean);
    placeholdersStr = arr.length ? JSON.stringify(arr) : null;
  }

  const id = Number(Date.now());
  const addition: Template = {
    id,
    name,
    subject,
    body: content,
    placeholders: placeholdersStr,
    toEmail,
    toName: toName || null,
    color: color || null,
    owner: session.user?.email || null,
  };
  const overlay = (await getJsonFromS3<Overlay>(
    TEMPLATES_OVERLAY.bucket,
    overlayKey
  )) || {
    additions: [],
    deletions: [],
  };
  overlay.additions.push(addition);
  await putJsonToS3(TEMPLATES_OVERLAY.bucket, overlayKey, overlay);
  return NextResponse.json({ template: addition }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const overlayKey = getUserOverlayKey(session.user?.email);
  const body = await req.json();
  const { id, color } = body || {};
  const idNum = Number(id);
  if (!Number.isFinite(idNum))
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const overlay = (await getJsonFromS3<Overlay>(
    TEMPLATES_OVERLAY.bucket,
    overlayKey
  )) || {
    additions: [],
    deletions: [],
    updates: [],
  };

  // Aggiorna solo template personali (presenti in additions)
  const idx = overlay.additions.findIndex((t) => Number(t.id) === idNum);
  if (idx < 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  overlay.additions[idx] = { ...overlay.additions[idx], color: color ?? null };
  // Rimuove eventuali updates per coerenza (non necessari in modalità personale)
  overlay.updates = (overlay.updates || []).filter(
    (u) => Number(u.id) !== idNum
  );

  await putJsonToS3(TEMPLATES_OVERLAY.bucket, overlayKey, overlay);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const overlayKey = getUserOverlayKey(session.user?.email);
  const body = await req.json();
  const { id, confirmName } = body || {};
  const idNum = Number(id);
  if (!Number.isFinite(idNum))
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const overlay = (await getJsonFromS3<Overlay>(
    TEMPLATES_OVERLAY.bucket,
    overlayKey
  )) || {
    additions: [],
    deletions: [],
    updates: [],
  };
  // Elimina solo template personali presenti in additions
  const addIndex = overlay.additions.findIndex((t) => Number(t.id) === idNum);
  if (addIndex < 0)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const item = overlay.additions[addIndex];
  if (typeof confirmName === "string" && confirmName !== item.name) {
    return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
  }
  overlay.additions.splice(addIndex, 1);
  // Pulisce eventuali updates per quell’id
  overlay.updates = (overlay.updates || []).filter(
    (u) => Number(u.id) !== idNum
  );
  await putJsonToS3(TEMPLATES_OVERLAY.bucket, overlayKey, overlay);
  return NextResponse.json({ ok: true });
}
