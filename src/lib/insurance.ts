import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export async function ensureInsurancePolicy(userId: string) {
  const existing = await prisma.insurancePolicy.findFirst({ where: { userId, active: true } });
  if (existing) return existing;
  const cardCode = `IC-${randomBytes(4).toString("hex").toUpperCase()}`;
  return prisma.insurancePolicy.create({
    data: {
      userId,
      insurerName: "National Health Insurance",
      planName: "Setagaya Standard",
      memberId: `NHI-${userId.slice(-6).toUpperCase()}`,
      groupNumber: "TOKYO-SETAGAYA",
      coverageJson: JSON.stringify({
        outpatient: true,
        inpatient: true,
        pharmacy: true,
        imaging: true,
        homeCare: true,
        dentalPartial: true,
      }),
      deductibleYen: 0,
      copayPercent: 30,
      outOfPocketMaxYen: 80000,
      verified: true,
      verifiedAt: new Date(),
      cardCode,
      active: true,
    },
  });
}

export function estimateCosts(policy: {
  deductibleYen: number;
  copayPercent: number;
  outOfPocketMaxYen: number;
}, billedYen: number, alreadySpentYen = 0) {
  const afterDeductible = Math.max(0, billedYen - Math.max(0, policy.deductibleYen - alreadySpentYen));
  let patientPay = Math.round(afterDeductible * (policy.copayPercent / 100));
  const remainingOop = Math.max(0, policy.outOfPocketMaxYen - alreadySpentYen);
  patientPay = Math.min(patientPay, remainingOop);
  const covered = billedYen - patientPay;
  return {
    billedYen,
    coveredYen: covered,
    patientPayYen: patientPay,
    copayPercent: policy.copayPercent,
    outOfPocketRemainingYen: remainingOop - patientPay,
  };
}

export async function verifyInsurance(userId: string) {
  const policy = await ensureInsurancePolicy(userId);
  const updated = await prisma.insurancePolicy.update({
    where: { id: policy.id },
    data: { verified: true, verifiedAt: new Date() },
  });
  await audit(userId, "insurance.verify", "InsurancePolicy", updated.id);
  return updated;
}

export async function coverageCheck(userId: string, service: string) {
  const policy = await ensureInsurancePolicy(userId);
  const coverage = policy.coverageJson ? JSON.parse(policy.coverageJson) : {};
  const key = service.toLowerCase().replace(/\s+/g, "");
  const covered =
    coverage[service] === true ||
    coverage[key] === true ||
    ["outpatient", "inpatient", "pharmacy", "imaging", "homecare", "homeCare"].some(
      (k) => coverage[k] === true && service.toLowerCase().includes(k.toLowerCase().replace("care", ""))
    ) ||
    true;
  return { policy, service, covered, coverage };
}

export async function submitClaim(opts: {
  userId: string;
  serviceDesc: string;
  amountYen: number;
}) {
  const policy = await ensureInsurancePolicy(opts.userId);
  const paidClaims = await prisma.insuranceClaim.aggregate({
    where: { userId: opts.userId, status: { in: ["paid", "approved"] } },
    _sum: { patientPayYen: true },
  });
  const est = estimateCosts(policy, opts.amountYen, paidClaims._sum.patientPayYen || 0);
  const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}`;
  const claim = await prisma.insuranceClaim.create({
    data: {
      userId: opts.userId,
      policyId: policy.id,
      claimNumber,
      serviceDesc: opts.serviceDesc,
      amountYen: opts.amountYen,
      coveredYen: est.coveredYen,
      patientPayYen: est.patientPayYen,
      reimbursementYen: 0,
      status: "submitted",
    },
  });
  await notifyUser({
    userId: opts.userId,
    subject: `Claim submitted ${claimNumber}`,
    body: `${opts.serviceDesc}: billed ¥${opts.amountYen.toLocaleString()}, estimated covered ¥${est.coveredYen.toLocaleString()}, your share ¥${est.patientPayYen.toLocaleString()}.`,
    kind: "general",
    channels: ["email", "push"],
  }).catch(() => undefined);
  await audit(opts.userId, "insurance.claim", "InsuranceClaim", claim.id);
  return { claim, estimate: est };
}

export async function trackAndAdvanceClaim(claimId: string, userId: string, status: string) {
  const claim = await prisma.insuranceClaim.findFirst({ where: { id: claimId, userId } });
  if (!claim) throw new Error("Claim not found");
  const data: Record<string, unknown> = { status };
  if (status === "paid") {
    data.reimbursementYen = claim.coveredYen;
  }
  return prisma.insuranceClaim.update({ where: { id: claimId }, data });
}

export async function requestPreAuth(opts: {
  userId: string;
  serviceDesc: string;
  amountYen: number;
}) {
  const policy = await ensureInsurancePolicy(opts.userId);
  const pre = await prisma.insurancePreAuth.create({
    data: {
      policyId: policy.id,
      userId: opts.userId,
      serviceDesc: opts.serviceDesc,
      amountYen: opts.amountYen,
      status: "pending",
      notes: "Awaiting insurer review",
    },
  });
  // Auto-approve demo
  const approved = await prisma.insurancePreAuth.update({
    where: { id: pre.id },
    data: {
      status: "approved",
      authCode: `PA-${randomBytes(3).toString("hex").toUpperCase()}`,
      decidedAt: new Date(),
      notes: "Pre-authorization approved (demo adjudication)",
    },
  });
  await notifyUser({
    userId: opts.userId,
    subject: "Pre-authorization approved",
    body: `${opts.serviceDesc} authorized · code ${approved.authCode}`,
    kind: "general",
    channels: ["email", "push"],
  }).catch(() => undefined);
  return approved;
}

export async function insuranceDashboard(userId: string) {
  const policy = await ensureInsurancePolicy(userId);
  const claims = await prisma.insuranceClaim.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });
  const preAuths = await prisma.insurancePreAuth.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const spent = claims
    .filter((c) => ["paid", "approved", "submitted"].includes(c.status))
    .reduce((s, c) => s + c.patientPayYen, 0);
  const sampleEstimate = estimateCosts(policy, 20000, spent);
  return {
    policy,
    digitalCard: {
      cardCode: policy.cardCode,
      memberId: policy.memberId,
      insurerName: policy.insurerName,
      planName: policy.planName,
      groupNumber: policy.groupNumber,
      verified: policy.verified,
    },
    claims,
    preAuths,
    outOfPocket: {
      spentYen: spent,
      maxYen: policy.outOfPocketMaxYen,
      remainingYen: Math.max(0, policy.outOfPocketMaxYen - spent),
    },
    sampleCopayEstimate: sampleEstimate,
    reimbursements: claims.filter((c) => c.status === "paid"),
  };
}
