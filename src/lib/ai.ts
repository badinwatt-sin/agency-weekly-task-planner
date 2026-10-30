import "server-only";
import JSZip from "jszip";
import { docxXmlToText, extractJson } from "./ai-draft";

// Calls the Claude API with the agency's own key (set in hosting env vars only).
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 150_000;

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const model = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export class AiError extends Error {}

export type NotesInput =
  | { kind: "text"; name: string; text: string }
  | { kind: "image"; name: string; mediaType: (typeof IMAGE_TYPES)[number]; data: string };

/** Read one uploaded file into text or an image block. Throws AiError with a person-readable message. */
export async function readUpload(file: File): Promise<NotesInput> {
  const name = file.name.slice(0, 200);
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) throw new AiError(`${name} is larger than 5 MB. Use a smaller photo or screenshot.`);
    return { kind: "image", name, mediaType: file.type as (typeof IMAGE_TYPES)[number], data: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  if (/\.docx$/i.test(name)) {
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) throw new Error("no document.xml");
      return { kind: "text", name, text: docxXmlToText(xml).slice(0, MAX_TEXT_CHARS) };
    } catch {
      throw new AiError(`${name} couldn't be read as a Word document. Copy its text into the notes box instead.`);
    }
  }
  if (/\.(txt|md|markdown|csv|tsv|json)$/i.test(name) || file.type.startsWith("text/")) {
    return { kind: "text", name, text: (await file.text()).slice(0, MAX_TEXT_CHARS) };
  }
  throw new AiError(`${name}: this file type can't be read. Use text, Word (.docx) or an image, or paste the text.`);
}

/** Ask Claude for the meeting plan; returns the parsed JSON value. */
export async function askClaudeForPlan(prompt: string, images: (NotesInput & { kind: "image" })[]): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("The meeting summarizer isn't set up. Add ANTHROPIC_API_KEY to the hosting environment variables.");
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
      body: JSON.stringify({
        model: model(),
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })),
            { type: "text", text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(170_000),
      cache: "no-store",
    });
  } catch {
    throw new AiError("Claude couldn't be reached. Check the connection and try again.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiError("The Claude API key was refused. Check ANTHROPIC_API_KEY in the hosting settings.");
    if (res.status === 429) throw new AiError("The Claude API rate or spending limit was reached. Try again in a few minutes, or check the limits in the Claude Console.");
    if (res.status === 413) throw new AiError("The notes and images are too large to send at once. Remove some images or split the notes.");
    if (res.status === 400) throw new AiError("Claude couldn't accept these notes. Try fewer or smaller images, or shorter notes.");
    throw new AiError("Claude is busy right now. Please try again in a minute.");
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  if (body.stop_reason === "refusal") throw new AiError("Claude declined to process these notes. Check they're the right notes.");
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  try {
    return extractJson(text);
  } catch {
    throw new AiError(body.stop_reason === "max_tokens" ? "The notes produced too many items at once. Split the notes and summarize them in parts." : "Claude's answer couldn't be read. Please try again.");
  }
}
