export type ShipmentEvent = {
  shipmentId: string;
  event: "delivered" | "exception" | "in_transit";
  proofOfDeliveryKey?: string;
  note: string;
};

export function decideShipmentEvent(input: {
  shipmentId: string;
  transcript: string;
  proofOfDeliveryKey?: string;
}): ShipmentEvent {
  const text = input.transcript.toLowerCase();
  if (text.includes("delivered") || text.includes("signed")) {
    return { shipmentId: input.shipmentId, event: "delivered", proofOfDeliveryKey: input.proofOfDeliveryKey, note: input.transcript };
  }
  if (text.includes("damaged") || text.includes("refused") || text.includes("exception")) {
    return { shipmentId: input.shipmentId, event: "exception", proofOfDeliveryKey: input.proofOfDeliveryKey, note: input.transcript };
  }
  return { shipmentId: input.shipmentId, event: "in_transit", proofOfDeliveryKey: input.proofOfDeliveryKey, note: input.transcript };
}
