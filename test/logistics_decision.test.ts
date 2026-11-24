import assert from "node:assert/strict";
import { decideShipmentEvent } from "../src/logistics_decision.js";

const event = decideShipmentEvent({
  shipmentId: "SHP-2048",
  transcript: "Driver says the parcel was delivered and signed at dock three.",
  proofOfDeliveryKey: "shipments/SHP-2048/pod.jpg"
});

assert.deepEqual(event, {
  shipmentId: "SHP-2048",
  event: "delivered",
  proofOfDeliveryKey: "shipments/SHP-2048/pod.jpg",
  note: "Driver says the parcel was delivered and signed at dock three."
});
console.log("delivery transcript produces a delivered shipment event");
