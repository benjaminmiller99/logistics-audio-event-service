import { readFile } from "node:fs/promises";
import { z } from "zod";
import { decideShipmentEvent } from "./logistics_decision.js";
import { ensureBucket, transcribeAudio, uploadAudio } from "./infrai_logistics.js";

const requestSchema = z.object({
  shipmentId: z.string().min(1),
  audioPath: z.string().min(1),
  proofOfDeliveryKey: z.string().min(1).optional()
});

const input = requestSchema.parse({
  shipmentId: process.env.SHIPMENT_ID ?? "SHP-2048",
  audioPath: process.env.AUDIO_PATH ?? "./fixtures/delivery.mp3",
  proofOfDeliveryKey: process.env.PROOF_OF_DELIVERY_KEY
});
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the service");

const bucket = process.env.INFRAI_BUCKET ?? "logistics-audio";
const audio = await readFile(input.audioPath);
await ensureBucket(bucket, apiKey);
const objectKey = `shipments/${input.shipmentId}/delivery.mp3`;
const storedKey = await uploadAudio(bucket, objectKey, audio, apiKey);
const transcript = await transcribeAudio(audio, apiKey);
const event = decideShipmentEvent({ shipmentId: input.shipmentId, transcript, proofOfDeliveryKey: input.proofOfDeliveryKey ?? storedKey });
console.log(JSON.stringify({ transcript, event }, null, 2));
