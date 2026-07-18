import { prisma } from "./db";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  userId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      email: opts.to,
      userId: opts.userId,
      channel: "email",
      subject: opts.subject,
      body: opts.body,
    },
  });
  return notification;
}

export function subscriptionCodeEmail(opts: {
  name?: string;
  code: string;
  plan: string;
  priceYen: number;
}) {
  return {
    subject: `[MedCare] Subscription registration code — ${opts.plan}`,
    body: [
      opts.name ? `Hello ${opts.name},` : "Hello,",
      "",
      "Thank you for purchasing a MedCare subscription.",
      "",
      `Plan: ${opts.plan}`,
      `Amount: ¥${opts.priceYen.toLocaleString()}`,
      "",
      `Your registration code: ${opts.code}`,
      "",
      "Enter this code during account registration to activate premium access.",
      "",
      "— MedCare Platform",
    ].join("\n"),
  };
}
