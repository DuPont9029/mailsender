import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function createRawMessage(to: string, subject: string, body: string) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const messageParts = [
    `From: Me <me>`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
  ];
  const message = messageParts.join("\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encodedMessage;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accessToken = (session as { accessToken?: string }).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "no_token" }, { status: 400 });

  const { to, subject, body } = await req.json();
  if (!to || !subject || !body)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const raw = createRawMessage(to, subject, body);
  try {
    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return NextResponse.json({ ok: true, id: res.data.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "send_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}