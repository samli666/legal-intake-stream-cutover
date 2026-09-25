import { z } from "zod";

export const matterIntakeSchema = z.object({
  matterId: z.string().min(3),
  clientName: z.string().min(1),
  contactEmail: z.string().email(),
  matterType: z.enum(["employment", "contract", "family", "estate"]),
  urgency: z.enum(["low", "normal", "high"]),
  intakeNarrative: z.string().min(30),
  hasSignedEngagement: z.boolean(),
  signedDocumentName: z.string().min(3).optional(),
  signedDocumentUrl: z.string().url().optional(),
  filingDeadlineIso: z.string().datetime().optional(),
  eventId: z.string().min(8)
}).superRefine((value, ctx) => {
  if (value.hasSignedEngagement && (!value.signedDocumentName || !value.signedDocumentUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signed matters need both signedDocumentName and signedDocumentUrl.",
      path: ["signedDocumentUrl"]
    });
  }
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;

export type DeliveryPlan = {
  status: "send-now" | "await-signature";
  channel: "portal" | "email";
  artifactName?: string;
  artifactUrl?: string;
};

export type FollowUpPlan = {
  status: "expedite" | "same-day" | "next-business-day" | "none";
  reason: string;
};

export type MatterDecision = {
  delivery: DeliveryPlan;
  followUp: FollowUpPlan;
};

export function decideMatterTransition(input: MatterIntake, now = new Date()): MatterDecision {
  const delivery: DeliveryPlan = input.hasSignedEngagement
    ? {
        status: "send-now",
        channel: "portal",
        artifactName: input.signedDocumentName,
        artifactUrl: input.signedDocumentUrl
      }
    : {
        status: "await-signature",
        channel: "email"
      };

  if (!input.filingDeadlineIso) {
    return {
      delivery,
      followUp: {
        status: input.urgency === "high" ? "same-day" : "next-business-day",
        reason: input.urgency === "high" ? "No court deadline supplied and intake marked high urgency." : "No deadline supplied; standard review queue."
      }
    };
  }

  const deadline = new Date(input.filingDeadlineIso);
  const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilDeadline <= 24) {
    return {
      delivery,
      followUp: {
        status: "expedite",
        reason: "Deadline is within 24 hours."
      }
    };
  }

  if (hoursUntilDeadline <= 72 || input.urgency === "high") {
    return {
      delivery,
      followUp: {
        status: "same-day",
        reason: input.urgency === "high" ? "Matter marked high urgency." : "Deadline is within 72 hours."
      }
    };
  }

  return {
    delivery,
    followUp: {
      status: "next-business-day",
      reason: "Deadline is more than 72 hours away."
    }
  };
}
