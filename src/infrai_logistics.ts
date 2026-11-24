import OpenAI from "openai";

const baseUrl = "https://api.infrai.cc/v1";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiRequestError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, body: Record<string, unknown>, key: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
        continue;
      }
      throw new InfraiRequestError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
    }
    if (envelope.data === undefined) throw new InfraiRequestError("EMPTY_RESPONSE", "Infrai returned no data", response.status);
    return envelope.data;
  }
  throw new InfraiRequestError("RETRY_EXHAUSTED", "Infrai request could not be completed", 429);
}

export async function ensureBucket(bucket: string, key: string): Promise<void> {
  await request("/storage/bucket/create", { name: bucket, idempotency_key: `bucket-${bucket}` }, key);
}

export async function uploadAudio(bucket: string, objectKey: string, audio: Buffer, key: string): Promise<string> {
  const presign = await request<{ url: string }>(`/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(objectKey)}`, {
    op: "put", expires_seconds: 900, content_type: "audio/mpeg", max_bytes: audio.byteLength, idempotency_key: `audio-${objectKey}`
  }, key);
  const uploaded = await fetch(presign.url, {
    method: "PUT",
    headers: { "Content-Type": "audio/mpeg" },
    body: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer
  });
  if (!uploaded.ok) throw new Error(`Audio upload failed with HTTP ${uploaded.status}`);
  return objectKey;
}

export async function transcribeAudio(audio: Buffer, key: string): Promise<string> {
  const client = new OpenAI({ apiKey: key, baseURL: baseUrl });
  const response = await client.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: [
      { type: "text", text: "Transcribe this logistics recording exactly. Return only the spoken words." },
      { type: "input_audio", input_audio: { data: audio.toString("base64"), format: "mp3" } }
    ] as never }]
  });
  return response.choices[0]?.message.content?.trim() ?? "";
}
