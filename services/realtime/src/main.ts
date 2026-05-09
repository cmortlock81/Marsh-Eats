// Realtime fanout is implemented in the API via Server-Sent Events for MVP simplicity.
// This service package is reserved for horizontal scaling with Redis Streams when traffic requires it.
export const realtimeStrategy = "sse-via-api";
