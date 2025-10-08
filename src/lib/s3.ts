import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    : undefined,
});

export async function presignedGetUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 300,
) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

export const TEMPLATES_PARQUET = {
  bucket: process.env.TEMPLATES_BUCKET!,
  key: process.env.TEMPLATES_KEY!,
};

export const TEMPLATES_OVERLAY = {
  bucket: process.env.TEMPLATES_BUCKET!,
  key: process.env.TEMPLATES_OVERLAY_KEY || "templates_overlay.json",
};

export const TEMPLATES_COLORS = {
  bucket: process.env.TEMPLATES_BUCKET!,
  key: process.env.TEMPLATES_COLORS_KEY || "templates_colors.json",
};

// Overlay per utente: salva template personali e aggiornamenti per ciascun user.
// Usa email normalizzata o subject claim se disponibile.
export function getUserOverlayKey(userIdentifier: string | null | undefined): string {
  const base = process.env.TEMPLATES_OVERLAY_KEY || "templates_overlay.json";
  const safe = (userIdentifier || "anon").replace(/[^a-zA-Z0-9_.-]+/g, "_");
  // Formato: templates_overlay/<user>.json se base finisce con .json, altrimenti suffix.
  if (base.endsWith(".json")) {
    return base.replace(/\.json$/, `/${safe}.json`);
  }
  return `${base}/${safe}.json`;
}

export async function getJsonFromS3<T = any>(bucket: string, key: string): Promise<T | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    // Node 18+ has transformToString
    // @ts-ignore
    const text: string = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (e) {
    return null;
  }
}

export async function putJsonToS3(bucket: string, key: string, data: any): Promise<void> {
  const body = JSON.stringify(data);
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json" }),
  );
}