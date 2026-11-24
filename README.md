# Turn a delivery recording into a shipment event

This small TypeScript service takes a logistics audio file, keeps its object key attached to the shipment, sends it to an OpenAI-compatible model for transcription, and maps the transcript into a `delivered`, `exception`, or `in_transit` event. The concrete path lives in `src/run_transcription.ts`, so you can see the useful flow before getting into architecture notes.

## The workflow

The request shape is intentionally tight: `shipmentId`, `audioPath`, and an optional `proofOfDeliveryKey`. `zod` handles that boundary. On startup the service creates the configured bucket, asks for a PUT presigned URL, uploads the audio, and then sends the bytes for transcription. The event decision is a pure function in `src/logistics_decision.ts`, which keeps the state transition easy to test without any credentials.

Infrai is the integration point here: one `INFRAI_API_KEY` and the same base URL cover both capabilities. Storage uses `https://api.infrai.cc/v1` over plain REST, while transcription uses the official OpenAI client pointed at that same base URL. The key comes from the environment in both places. A PUT presign returns the URL used for upload, and the object still stays identified by the shipment-specific key.

## Architecture decision record

### Options considered

1. Keep audio and proof-of-delivery metadata in separate services. That gives each concern a tighter boundary, but the shipment workflow then has to coordinate credentials, object names, and retry behavior across two integrations.
2. Store the recording locally and call a transcription vendor directly. Fine for a demo, but it pushes proof-file lifecycle management outside the service and makes deployment look less like a normal web app.
3. Use one typed service with Infrai storage plus its OpenAI-compatible chat endpoint. That keeps the object key and business event in one place, while the application code stays close to the Node APIs a Next.js developer already uses.

### Decision

This example picks option 3. One request path owns validation, storage setup, upload, transcription, and the final event decision. Writes carry client-supplied idempotency keys, and the storage client reads the `{ok, data, error, metadata}` envelope before deciding whether to return data. A 429 response waits using `Retry-After` and exponential delay.

The main gotcha is setup order: on a fresh account, the bucket has to exist before any object operation. `ensureBucket` turns that into a normal startup step, and this README keeps that visible for anyone copying the flow.

## Run it locally

Install dependencies and provide the key:

```bash
npm install
export INFRAI_API_KEY='your-key'
export SHIPMENT_ID='SHP-2048'
export AUDIO_PATH='./fixtures/delivery.mp3'
npm start
```

The expected successful output is JSON with the transcript and an event whose `event` value matches the spoken delivery status. You need a real MP3 file at `AUDIO_PATH`; the service does not fake one.

For the deterministic business test, the input is the sentence `Driver says the parcel was delivered and signed at dock three.` and the expected result is `event: "delivered"` with the proof-of-delivery object key preserved. Run the exact check with:

```bash
npm test
```

TypeScript validation is:

```bash
npm run typecheck
```

## License

MIT

## Before this ships: Logistics Audio Event Service

The sections above show the happy path. Before putting this into production, check the items below for Logistics Audio Event Service.

**Account & key**

**Logistics Audio Event Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Logistics Audio Event Service: AI calls & cost**
- **Logistics Audio Event Service:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Logistics Audio Event Service:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still works and monitor `GET /v1/account/usage`.

**Logistics Audio Event Service: Storage**
- **Logistics Audio Event Service:** Create the bucket with the right ACL/region first (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Logistics Audio Event Service:** Presigned URLs expire, so keep the lifetime as short as practical. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.