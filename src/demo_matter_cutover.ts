const payload = {
  matterId: "MAT-2026-041",
  clientName: "Avery Cole",
  contactEmail: "avery@example.com",
  matterType: "employment",
  urgency: "high",
  intakeNarrative: "Client reports a termination meeting scheduled for tomorrow morning and wants counsel to review a severance agreement before signing.",
  hasSignedEngagement: true,
  signedDocumentName: "engagement-letter-avery-cole.pdf",
  signedDocumentUrl: "https://example.com/signed/engagement-letter-avery-cole.pdf",
  filingDeadlineIso: "2026-10-05T15:00:00.000Z",
  eventId: "evt_cutover_0001"
};

const response = await fetch("http://localhost:3000/matter-intake/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

if (!response.body) {
  throw new Error("Expected a streaming response body.");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) {
    break;
  }
  process.stdout.write(decoder.decode(value, { stream: true }));
}
