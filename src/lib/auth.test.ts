import { describe, expect, test } from "bun:test";
import { hasValidRequestOrigin } from "./auth";

function request(origin: string, forwardedHost?: string, forwardedProto?: string) {
  const headers: Record<string, string> = { origin };
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
  if (forwardedProto) headers["x-forwarded-proto"] = forwardedProto;
  return new Request("http://localhost:6119/api/upload/chunk", { headers });
}

describe("request origin validation", () => {
  test("allows direct and reverse-proxied same-origin requests", () => {
    expect(hasValidRequestOrigin(request("http://localhost:6119"))).toBe(true);
    expect(hasValidRequestOrigin(request("https://example.domain.com", "example.domain.com", "https"))).toBe(true);
  });

  test("rejects other subdomains, mismatched schemes and spoofed forwarded hosts", () => {
    expect(hasValidRequestOrigin(request("https://other.domain.com", "example.domain.com", "https"))).toBe(false);
    expect(hasValidRequestOrigin(request("https://example.domain.com", "example.domain.com", "http"))).toBe(false);
    expect(hasValidRequestOrigin(request("https://example.domain.com", "evil.com@example.domain.com", "https"))).toBe(false);
    expect(hasValidRequestOrigin(request("null", "example.domain.com", "https"))).toBe(false);
    expect(hasValidRequestOrigin(request("https://example.domain.com"))).toBe(false);
  });
});
