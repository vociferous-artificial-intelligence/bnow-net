import { describe, expect, it } from "vitest";
import {
  DIGEST_RECIPIENTS_SQL,
  ELIGIBLE_SUBSCRIPTION_STATUSES,
  eligibleRecipients,
} from "./digest-recipients";

// Recipient-policy regression (2026-07-13): the digest mailer used to UNION in
// every subscribe_intents address, so anyone who merely REQUESTED beta access
// on /access (source='access_form', request_status='new') would have received a
// production intelligence digest. These tests pin the boundary.

describe("digest recipient pool query", () => {
  it("never selects from subscribe_intents — an access request is not a subscription", () => {
    expect(DIGEST_RECIPIENTS_SQL).not.toContain("subscribe_intents");
  });

  it("draws only from real accounts joined to their subscriptions", () => {
    expect(DIGEST_RECIPIENTS_SQL).toContain("FROM users");
    expect(DIGEST_RECIPIENTS_SQL).toContain("JOIN subscriptions");
    expect(DIGEST_RECIPIENTS_SQL).toContain("s.status");
  });
});

describe("eligibleRecipients policy", () => {
  it("includes active and pending subscribers", () => {
    expect(ELIGIBLE_SUBSCRIPTION_STATUSES).toEqual(["active", "pending"]);
    expect(
      eligibleRecipients([
        { email: "active@example.com", status: "active" },
        { email: "pending@example.com", status: "pending" },
      ]),
    ).toEqual(["active@example.com", "pending@example.com"]);
  });

  it("excludes canceled and past_due subscriptions", () => {
    expect(
      eligibleRecipients([
        { email: "gone@example.com", status: "canceled" },
        { email: "late@example.com", status: "past_due" },
        { email: "ok@example.com", status: "active" },
      ]),
    ).toEqual(["ok@example.com"]);
  });

  it("an access requester (new OR approved) is structurally excluded: no users/subscriptions row, no input row", () => {
    // The pool query never reads subscribe_intents, so a requester simply never
    // appears in the input. There is no status value that could smuggle one in:
    // request_status values are not subscription statuses.
    expect(eligibleRecipients([{ email: "requester@example.com", status: "new" }])).toEqual([]);
    expect(eligibleRecipients([{ email: "requester@example.com", status: "approved" }])).toEqual([]);
  });

  it("dedupes case-insensitively across duplicate eligible rows (first spelling wins)", () => {
    expect(
      eligibleRecipients([
        { email: "One@Example.com", status: "active" },
        { email: "one@example.com", status: "pending" },
        { email: "two@example.com", status: "active" },
      ]),
    ).toEqual(["One@Example.com", "two@example.com"]);
  });

  it("drops null/blank emails and null statuses", () => {
    expect(
      eligibleRecipients([
        { email: null, status: "active" },
        { email: "   ", status: "active" },
        { email: "x@example.com", status: null },
      ]),
    ).toEqual([]);
  });

  it("returns [] with zero eligible rows — the mailer must send nothing (no demo fallback)", () => {
    expect(eligibleRecipients([])).toEqual([]);
  });
});
