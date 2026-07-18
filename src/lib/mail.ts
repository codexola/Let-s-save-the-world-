import nodemailer from "nodemailer";
import { config } from "./config";
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

  if (config.notifications.smtp.enabled) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.notifications.smtp.host,
        port: config.notifications.smtp.port,
        secure: config.notifications.smtp.port === 465,
        auth: {
          user: config.notifications.smtp.user,
          pass: config.notifications.smtp.pass,
        },
      });
      await transporter.sendMail({
        from: config.notifications.smtp.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
      });
    } catch (err) {
      console.warn("[mail] SMTP send failed, inbox notification kept:", err);
    }
  }

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
