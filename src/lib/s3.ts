import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
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
  expiresInSeconds = 300
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
export function getUserOverlayKey(
  userIdentifier: string | null | undefined
): string {
  const base = process.env.TEMPLATES_OVERLAY_KEY || "templates_overlay.json";
  const safe = (userIdentifier || "anon").replace(/[^a-zA-Z0-9_.-]+/g, "_");
  // Formato: templates_overlay/<user>.json se base finisce con .json, altrimenti suffix.
  if (base.endsWith(".json")) {
    return base.replace(/\.json$/, `/${safe}.json`);
  }
  return `${base}/${safe}.json`;
}

export async function getJsonFromS3<T>(
  bucket: string,
  key: string
): Promise<T | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    // Node 18+ has transformToString
    const body = res.Body;
    interface TransformToStringBody {
      transformToString: () => Promise<string>;
    }
    const candidate = body as Partial<TransformToStringBody> | undefined;
    const text: string | undefined =
      candidate && typeof candidate.transformToString === "function"
        ? await candidate.transformToString()
        : undefined;
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function putJsonToS3(
  bucket: string,
  key: string,
  data: unknown
): Promise<void> {
  const body = JSON.stringify(data);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );
}

export async function getFileBufferFromS3(
  bucket: string,
  key: string
): Promise<Buffer | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const body = res.Body;
    if (!body) return null;

    // Handle different response body types
    if (body instanceof Buffer) {
      return body;
    }

    // transformToByteArray is available in newer SDK versions
    if (typeof body.transformToByteArray === "function") {
      const byteArray = await body.transformToByteArray();
      return Buffer.from(byteArray);
    }

    // Fallback for Node stream
    const chunks: Uint8Array[] = [];
    // @ts-expect-error - Body type missing async iterator
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (e) {
    console.error("Error fetching file from S3:", e);
    return null;
  }
}
