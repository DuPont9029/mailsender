import {
  S3Client,
  ListBucketsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
// import * as dotenv from "dotenv";
// dotenv.config();

// Manually load .env for this script since dotenv is not installed
import fs from "fs";
const envFile = fs.readFileSync(".env", "utf8");
envFile.split("\n").forEach((line) => {
  const [key, ...val] = line.split("=");
  if (key && val) {
    process.env[key.trim()] = val.join("=").trim();
  }
});

async function checkS3() {
  console.log("Checking S3 connection...");
  console.log("Region:", process.env.AWS_REGION);
  console.log("Endpoint:", process.env.AWS_S3_ENDPOINT);
  console.log("Access Key Length:", process.env.AWS_ACCESS_KEY_ID?.length);

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    console.log("Attempting to list buckets...");
    const data = await s3.send(new ListBucketsCommand({}));
    console.log("Buckets:", data.Buckets?.map((b) => b.Name).join(", "));
  } catch (err) {
    console.error("Error listing buckets:", err);
  }

  const bucket = process.env.TEMPLATES_BUCKET;
  const key = process.env.TEMPLATES_KEY;

  if (bucket && key) {
    try {
      console.log(`Checking file s3://${bucket}/${key}...`);
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      console.log("File exists!");
    } catch (err) {
      console.error("Error checking file:", err);
    }
  } else {
    console.log("TEMPLATES_BUCKET or TEMPLATES_KEY not set.");
  }
}

checkS3();
