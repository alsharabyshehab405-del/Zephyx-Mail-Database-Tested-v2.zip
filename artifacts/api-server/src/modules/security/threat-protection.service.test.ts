import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeIncomingThreat,
  securityProviderStatus,
} from "./threat-protection.service.js";

afterEach(() => {
  delete process.env.ATTACHMENT_SCANNING_ENABLED;
  delete process.env.CLAMAV_HOST;
  delete process.env.CLAMAV_PORT;
  delete process.env.THREAT_BLOCKED_DOMAINS;
});

describe("threat protection v1 analysis", () => {
  it("scores credential lures and exposes authentication and URL findings", () => {
    const analysis = analyzeIncomingThreat({
      fromEmail: "alerts@example.com",
      subject: "Urgent: verify your account",
      bodyText: "Sign in immediately at http://198.51.100.20/verify and provide your password.",
      authenticationResults: "mx.example; spf=fail; dkim=pass; dmarc=fail",
      returnPath: "bounce@example.net",
      replyTo: "reply@other.example",
      hasAttachments: false,
    });

    expect(analysis.spfResult).toBe("fail");
    expect(analysis.dkimResult).toBe("pass");
    expect(analysis.dmarcResult).toBe("fail");
    expect(analysis.spoofingRisk).toBe("high");
    expect(analysis.spamScore).toBeGreaterThanOrEqual(25);
    expect(analysis.spamReasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(["credential_request", "urgent_action"]));
    expect(analysis.urlFindings[0]).toMatchObject({ host: "198.51.100.20", verdict: "suspicious" });
    expect(analysis.overallRisk).toBe("high");
  });

  it("keeps missing authentication headers unknown and flags a blocked domain", () => {
    process.env.THREAT_BLOCKED_DOMAINS = "blocked.example";
    const analysis = analyzeIncomingThreat({
      fromEmail: "sender@trusted.example",
      subject: "A normal message",
      bodyText: "Visit https://blocked.example/welcome",
      hasAttachments: true,
    });

    expect(analysis.spfResult).toBe("unknown");
    expect(analysis.dkimResult).toBe("unknown");
    expect(analysis.dmarcResult).toBe("unknown");
    expect(analysis.urlFindings[0]).toMatchObject({ host: "blocked.example", verdict: "malicious" });
    expect(analysis.malwareStatus).toBe("clean");
    expect(analysis.overallRisk).toBe("high");
  });
});

describe("threat protection provider status", () => {
  it("reports attachment scanning as not configured unless the active ClamAV endpoint is complete", () => {
    process.env.ATTACHMENT_SCANNING_ENABLED = "true";
    process.env.CLAMAV_HOST = "clamav";
    process.env.CLAMAV_PORT = "not-a-port";
    expect(securityProviderStatus().attachmentScanning).toBe("NOT_CONFIGURED");

    process.env.CLAMAV_PORT = "3310";
    expect(securityProviderStatus().attachmentScanning).toBe("configured");
    expect(securityProviderStatus().attachmentPolicy).toBe("fail_closed");
  });
});
