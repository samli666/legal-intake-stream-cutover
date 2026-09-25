import test from "node:test";
import assert from "node:assert/strict";
import { decideMatterTransition, matterIntakeSchema } from "../src/legal_workflow.js";

test("expedites a matter due within 24 hours and sends signed document now", () => {
  const input = matterIntakeSchema.parse({
    matterId: "MAT-1001",
    clientName: "Jordan Lee",
    contactEmail: "jordan@example.com",
    matterType: "contract",
    urgency: "normal",
    intakeNarrative: "Counterparty sent a new contract and the client needs attorney review before tomorrow's board meeting.",
    hasSignedEngagement: true,
    signedDocumentName: "signed-engagement.pdf",
    signedDocumentUrl: "https://example.com/signed/signed-engagement.pdf",
    filingDeadlineIso: "2026-03-02T12:00:00.000Z",
    eventId: "evt_test_1001"
  });

  const decision = decideMatterTransition(input, new Date("2026-03-01T13:00:00.000Z"));

  assert.deepEqual(decision, {
    delivery: {
      status: "send-now",
      channel: "portal",
      artifactName: "signed-engagement.pdf",
      artifactUrl: "https://example.com/signed/signed-engagement.pdf"
    },
    followUp: {
      status: "expedite",
      reason: "Deadline is within 24 hours."
    }
  });
});
