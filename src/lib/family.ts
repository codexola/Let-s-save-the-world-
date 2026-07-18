import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const FAMILY_RELATIONSHIPS = [
  "parent",
  "child",
  "grandparent",
  "spouse",
  "dependent",
] as const;

export async function ensureFamilySeed(ownerId: string) {
  const count = await prisma.familyMember.count({ where: { ownerId } });
  if (count > 0) return;
  const members = [
    {
      name: "Hiroshi Tanaka",
      relationship: "parent",
      emergencyContact: "Yuki Tanaka 090-1111-2222",
      medications: "Atorvastatin 10mg daily",
      vaccinationNotes: "Influenza 2025 completed",
      allergies: "None",
    },
    {
      name: "Hanako Tanaka",
      relationship: "parent",
      emergencyContact: "Yuki Tanaka 090-1111-2222",
      medications: "Calcium + Vit D",
      vaccinationNotes: "COVID booster due",
      allergies: "Shellfish",
    },
    {
      name: "Sora Tanaka",
      relationship: "child",
      dateOfBirth: new Date("2016-05-12"),
      medications: "None",
      vaccinationNotes: "HPV series planned; MMR complete",
      emergencyContact: "Yuki Tanaka (parent)",
    },
    {
      name: "Kenji Tanaka",
      relationship: "grandparent",
      medications: "Donepezil 5mg evening",
      medicalNotes: "Mild cognitive impairment — follow neurology",
      emergencyContact: "Yuki Tanaka",
      vaccinationNotes: "Pneumococcal + flu",
    },
    {
      name: "Aya Tanaka",
      relationship: "spouse",
      medications: "Prenatal vitamins",
      vaccinationNotes: "Tdap in pregnancy per OB",
      emergencyContact: "Yuki Tanaka",
    },
    {
      name: "Mika Sato",
      relationship: "dependent",
      medications: "Albuterol PRN",
      medicalNotes: "Asthma action plan on file",
      vaccinationNotes: "School vaccines up to date",
      emergencyContact: "Yuki Tanaka",
    },
  ];
  for (const m of members) {
    const member = await prisma.familyMember.create({
      data: {
        ownerId,
        name: m.name,
        relationship: m.relationship,
        dateOfBirth: "dateOfBirth" in m ? m.dateOfBirth : undefined,
        emergencyContact: m.emergencyContact,
        medications: m.medications,
        vaccinationNotes: m.vaccinationNotes,
        medicalNotes: "medicalNotes" in m ? m.medicalNotes : undefined,
        allergies: "allergies" in m ? m.allergies : undefined,
      },
    });
    await prisma.familyAppointment.create({
      data: {
        ownerId,
        familyMemberId: member.id,
        title: `Checkup — ${m.name}`,
        scheduledAt: new Date(Date.now() + (7 + Math.floor(Math.random() * 20)) * 86400_000),
        location: "Tokyo Central Hospital",
        notes: "Family-managed appointment",
        status: "booked",
      },
    });
    if (m.medications && m.medications !== "None") {
      await prisma.familyMedicationLog.create({
        data: {
          ownerId,
          familyMemberId: member.id,
          medication: m.medications.split(",")[0].trim(),
          schedule: "daily",
          nextDueAt: new Date(Date.now() + 6 * 3600_000),
          active: true,
        },
      });
    }
  }
}

export async function familyDashboard(ownerId: string) {
  await ensureFamilySeed(ownerId);
  const members = await prisma.familyMember.findMany({
    where: { ownerId, active: true },
    include: {
      appointments: { orderBy: { scheduledAt: "asc" }, take: 5 },
      medicationLogs: { where: { active: true } },
    },
    orderBy: { name: "asc" },
  });
  const appointments = await prisma.familyAppointment.findMany({
    where: { ownerId, status: "booked", scheduledAt: { gte: new Date() } },
    include: { familyMember: true },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  const medications = await prisma.familyMedicationLog.findMany({
    where: { ownerId, active: true },
    include: { familyMember: true },
  });
  const byRelationship = Object.fromEntries(
    FAMILY_RELATIONSHIPS.map((r) => [r, members.filter((m) => m.relationship === r)])
  );
  return {
    members,
    appointments,
    medications,
    byRelationship,
    relationships: FAMILY_RELATIONSHIPS,
    emergencyContacts: members
      .filter((m) => m.emergencyContact)
      .map((m) => ({ member: m.name, relationship: m.relationship, contact: m.emergencyContact })),
  };
}

export async function addFamilyMember(opts: {
  ownerId: string;
  name: string;
  relationship: string;
  dateOfBirth?: string;
  emergencyContact?: string;
  phone?: string;
  allergies?: string;
  medications?: string;
  medicalNotes?: string;
  vaccinationNotes?: string;
}) {
  if (!FAMILY_RELATIONSHIPS.includes(opts.relationship as (typeof FAMILY_RELATIONSHIPS)[number])) {
    throw new Error("Invalid relationship");
  }
  const member = await prisma.familyMember.create({
    data: {
      ownerId: opts.ownerId,
      name: opts.name,
      relationship: opts.relationship,
      dateOfBirth: opts.dateOfBirth ? new Date(opts.dateOfBirth) : null,
      emergencyContact: opts.emergencyContact,
      phone: opts.phone,
      allergies: opts.allergies,
      medications: opts.medications,
      medicalNotes: opts.medicalNotes,
      vaccinationNotes: opts.vaccinationNotes,
    },
  });
  await audit(opts.ownerId, "family.add", "FamilyMember", member.id);
  return member;
}

export async function bookFamilyAppointment(opts: {
  ownerId: string;
  familyMemberId: string;
  title: string;
  scheduledAt: string;
  location?: string;
  notes?: string;
}) {
  const member = await prisma.familyMember.findFirst({
    where: { id: opts.familyMemberId, ownerId: opts.ownerId },
  });
  if (!member) throw new Error("Family member not found");
  const appt = await prisma.familyAppointment.create({
    data: {
      ownerId: opts.ownerId,
      familyMemberId: opts.familyMemberId,
      title: opts.title,
      scheduledAt: new Date(opts.scheduledAt),
      location: opts.location,
      notes: opts.notes,
      status: "booked",
    },
  });
  await notifyUser({
    userId: opts.ownerId,
    subject: "Family appointment booked",
    body: `${opts.title} for ${member.name} on ${new Date(opts.scheduledAt).toLocaleString()}.`,
    kind: "appointment",
    channels: ["email", "push"],
  }).catch(() => undefined);
  return appt;
}

export async function manageFamilyMedication(opts: {
  ownerId: string;
  familyMemberId: string;
  medication: string;
  dosage?: string;
  schedule?: string;
}) {
  const member = await prisma.familyMember.findFirst({
    where: { id: opts.familyMemberId, ownerId: opts.ownerId },
  });
  if (!member) throw new Error("Family member not found");
  return prisma.familyMedicationLog.create({
    data: {
      ownerId: opts.ownerId,
      familyMemberId: opts.familyMemberId,
      medication: opts.medication,
      dosage: opts.dosage,
      schedule: opts.schedule || "daily",
      nextDueAt: new Date(Date.now() + 12 * 3600_000),
      active: true,
    },
  });
}
