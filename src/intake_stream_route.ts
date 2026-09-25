import { createHash } from "node:crypto";
import { infrai } from "./infrai_client.js";
import { type MatterDecision, matterIntakeSchema, decideMatterTransition } from "./legal_workflow.js";

export type IntakeStreamResult = {
  intakeId: string;
  decision: MatterDecision;
  tokenEstimate?: unknown;
};

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function handleIntakeStream(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = matterIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid intake payload.",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const intake = parsed.data;
  const decision = decideMatterTransition(intake);
  const intakeId = createHash("sha256").update(`${intake.eventId}:${intake.matterId}`).digest("hex").slice(0, 16);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
      controller.enqueue(encoder.encode(sseChunk("matter.accepted", { intakeId, matterId: intake.matterId })));
      controller.enqueue(encoder.encode(sseChunk("matter.decision", decision)));

      const systemPrompt = [
        "You write short legal-ops UI summaries.",
        "Return plain text only.",
        "Mention intake summary, signed document delivery state, and follow-up timing."
      ].join(" ");

      const userPrompt = [
        `Client: ${intake.clientName}`,
        `Matter type: ${intake.matterType}`,
        `Urgency: ${intake.urgency}`,
        `Signed engagement: ${intake.hasSignedEngagement ? "yes" : "no"}`,
        `Intake narrative: ${intake.intakeNarrative}`,
        `Decision delivery: ${decision.delivery.status} via ${decision.delivery.channel}`,
        `Follow-up: ${decision.followUp.status} because ${decision.followUp.reason}`
      ].join("\n");

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];
      const tokenEnvelope = await infrai.ai.tokens.count<{ count: number }>({
        model: "auto",
        messages
      });

      controller.enqueue(encoder.encode(sseChunk("matter.tokens", tokenEnvelope.data ?? {})));

      const completion = await infrai.chat.completions.create({
        model: "auto",
        stream: true,
        messages
      });

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          controller.enqueue(encoder.encode(sseChunk("matter.summary.delta", { text: delta })));
        }
      }

      const result: IntakeStreamResult = {
        intakeId,
        decision,
        tokenEstimate: tokenEnvelope.data
      };

      controller.enqueue(encoder.encode(sseChunk("matter.completed", result)));
      controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(sseChunk("matter.error", {
          error: error instanceof Error ? error.message : "Intake stream failed."
        })));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
