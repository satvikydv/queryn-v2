/**
 * Structured security event logger (P67).
 * Logs to stderr as JSON. In production, extend to forward to a SIEM,
 * CloudWatch Logs Insights, or an alerting webhook.
 */

export type SecurityEventType =
  | "AUTH_FAILURE"
  | "ACCESS_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "INVALID_INPUT"
  | "SUSPICIOUS_INPUT";

export interface SecurityEvent {
  event: SecurityEventType;
  userId?: string;
  path?: string;
  resource?: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

export function logSecurityEvent(e: SecurityEvent): void {
  const ts = new Date().toISOString();
  // Structured JSON — easy to parse with log aggregators (Datadog, Splunk, etc.)
  console.warn(JSON.stringify({ level: "SECURITY", timestamp: ts, ...e }));
}
