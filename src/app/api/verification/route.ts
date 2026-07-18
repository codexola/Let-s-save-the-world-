import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { audit, requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { config } from "@/lib/config";
import {
  generateOtpCode,
  verifyBusinessRegistration,
  verifyFaceMatch,
  verifyGovernmentDoctorDb,
  verifyGovernmentId,
  verifyHospitalAffiliation,
  verifyMedicalInstitution,
  verifyMedicalLicense,
  verifyPhoneFormat,
  verifyTaxId,
} from "@/lib/verification";

async function createVerificationRecord(opts: {
  userId: string;
  roleType: string;
  type: string;
  status: string;
  documentUrl?: string;
  documentData?: object;
  notes?: string;
  reviewedById?: string;
}) {
  return prisma.identityVerification.create({
    data: {
      userId: opts.userId,
      roleType: opts.roleType,
      type: opts.type,
      status: opts.status,
      documentUrl: opts.documentUrl,
      documentData: opts.documentData ? JSON.stringify(opts.documentData) : null,
      notes: opts.notes,
      reviewedById: opts.reviewedById,
      verifiedAt: opts.status === "approved" ? new Date() : null,
    },
  });
}

export async function GET() {
  try {
    const session = await requireSession();
    const [user, verifications, pending] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.id },
        include: {
          patientProfile: true,
          doctorProfile: true,
          hospitalProfile: true,
          companyProfile: true,
        },
      }),
      prisma.identityVerification.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      session.role === Role.ADMIN || session.role === Role.DEVELOPER || session.role === Role.HOSPITAL
        ? prisma.identityVerification.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      user: {
        phone: user?.phone,
        phoneVerified: user?.phoneVerified,
        role: user?.role,
        patientProfile: user?.patientProfile,
        doctorProfile: user?.doctorProfile,
        hospitalProfile: user?.hospitalProfile,
        companyProfile: user?.companyProfile,
      },
      verifications,
      pendingReviews: pending,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  try {
    const session = await requireSession();

    if (action === "patient_government_id") {
      const idNumber = String(body.governmentId || "");
      const idType = String(body.governmentIdType || "national_id");
      const documentUrl = body.documentUrl ? String(body.documentUrl) : undefined;
      const result = verifyGovernmentId(idNumber, idType);
      if (!result.ok) {
        await createVerificationRecord({
          userId: session.id,
          roleType: "PATIENT",
          type: "government_id",
          status: "rejected",
          documentUrl,
          documentData: { idType, idNumberMasked: idNumber.slice(-4) },
          notes: result.reason,
        });
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      await prisma.patientProfile.upsert({
        where: { userId: session.id },
        update: {
          governmentId: idNumber,
          governmentIdType: idType,
          governmentIdDocument: documentUrl,
          governmentIdVerified: true,
        },
        create: {
          userId: session.id,
          governmentId: idNumber,
          governmentIdType: idType,
          governmentIdDocument: documentUrl,
          governmentIdVerified: true,
        },
      });
      await createVerificationRecord({
        userId: session.id,
        roleType: "PATIENT",
        type: "government_id",
        status: "approved",
        documentUrl,
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.government_id", "PatientProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "patient_face") {
      const faceImageUrl = String(body.faceImageUrl || "");
      const profile = await prisma.patientProfile.findUnique({ where: { userId: session.id } });
      const result = verifyFaceMatch(profile?.governmentIdDocument || undefined, faceImageUrl);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      await prisma.patientProfile.upsert({
        where: { userId: session.id },
        update: { faceImageUrl, faceVerified: true },
        create: { userId: session.id, faceImageUrl, faceVerified: true },
      });
      await createVerificationRecord({
        userId: session.id,
        roleType: "PATIENT",
        type: "face",
        status: "approved",
        documentUrl: faceImageUrl,
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.face", "PatientProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "phone_send_otp") {
      const userRow = await prisma.user.findUnique({ where: { id: session.id } });
      const phone = String(body.phone || userRow?.phone || "");
      const format = verifyPhoneFormat(phone);
      if (!format.ok) {
        return NextResponse.json({ error: format.reason }, { status: 400 });
      }
      const code = generateOtpCode();
      await prisma.phoneOtp.create({
        data: {
          phone: format.normalized!,
          code,
          userId: session.id,
          purpose: "phone_verify",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await prisma.user.update({
        where: { id: session.id },
        data: { phone: format.normalized },
      });
      // Store OTP in notifications inbox (and Twilio when configured)
      await prisma.notification.create({
        data: {
          userId: session.id,
          email: session.email,
          channel: config.notifications.twilio.enabled ? "sms" : "inbox",
          subject: "Phone verification code",
          body: `Your MedCare verification code is ${code}. Valid for 10 minutes.`,
        },
      });
      if (config.notifications.twilio.enabled) {
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${config.notifications.twilio.accountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization:
                  "Basic " +
                  Buffer.from(
                    `${config.notifications.twilio.accountSid}:${config.notifications.twilio.authToken}`
                  ).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: format.normalized!,
                From: config.notifications.twilio.from,
                Body: `MedCare code: ${code}`,
              }),
            }
          );
        } catch {
          /* inbox fallback already stored */
        }
      }
      await audit(session.id, "verify.phone_otp_sent", "User");
      return NextResponse.json({
        ok: true,
        sent: true,
        demoCode: config.notifications.twilio.enabled ? undefined : code,
        channel: config.notifications.twilio.enabled ? "sms" : "inbox",
      });
    }

    if (action === "phone_verify_otp") {
      const code = String(body.code || "");
      const otp = await prisma.phoneOtp.findFirst({
        where: {
          userId: session.id,
          purpose: "phone_verify",
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!otp || otp.code !== code) {
        return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
      }
      await prisma.phoneOtp.update({ where: { id: otp.id }, data: { consumed: true } });
      await prisma.user.update({
        where: { id: session.id },
        data: { phoneVerified: true, phone: otp.phone },
      });
      await createVerificationRecord({
        userId: session.id,
        roleType: session.role,
        type: "phone",
        status: "approved",
        notes: `Phone ${otp.phone} verified`,
      });
      await audit(session.id, "verify.phone", "User");
      return NextResponse.json({ ok: true, phoneVerified: true });
    }

    if (action === "doctor_license") {
      const licenseNumber = String(body.licenseNumber || "");
      const documentUrl = body.licenseDocumentUrl ? String(body.licenseDocumentUrl) : undefined;
      const result = verifyMedicalLicense(licenseNumber);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      await prisma.doctorProfile.upsert({
        where: { userId: session.id },
        update: {
          licenseNumber,
          licenseDocumentUrl: documentUrl,
          licenseVerified: true,
        },
        create: {
          userId: session.id,
          licenseNumber,
          licenseDocumentUrl: documentUrl,
          licenseVerified: true,
        },
      });
      await createVerificationRecord({
        userId: session.id,
        roleType: "DOCTOR",
        type: "license",
        status: "approved",
        documentUrl,
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.license", "DoctorProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "doctor_gov_db") {
      const profile = await prisma.doctorProfile.findUnique({ where: { userId: session.id } });
      const nationalRegNumber = String(body.nationalRegNumber || profile?.nationalRegNumber || "");
      const result = verifyGovernmentDoctorDb(nationalRegNumber, profile?.licenseNumber || undefined);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      await prisma.doctorProfile.upsert({
        where: { userId: session.id },
        update: { nationalRegNumber, govDbVerified: true },
        create: { userId: session.id, nationalRegNumber, govDbVerified: true },
      });
      await createVerificationRecord({
        userId: session.id,
        roleType: "DOCTOR",
        type: "gov_db",
        status: "approved",
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.gov_db", "DoctorProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "doctor_request_hospital_confirm") {
      const profile = await prisma.doctorProfile.findUnique({ where: { userId: session.id } });
      const affiliation = String(body.hospitalAffiliation || profile?.hospitalAffiliation || "");
      const hospitals = await prisma.hospitalProfile.findMany({ select: { name: true, userId: true } });
      const result = verifyHospitalAffiliation(
        affiliation,
        hospitals.map((h) => h.name)
      );
      await prisma.doctorProfile.upsert({
        where: { userId: session.id },
        update: { hospitalAffiliation: affiliation },
        create: { userId: session.id, hospitalAffiliation: affiliation },
      });
      const record = await createVerificationRecord({
        userId: session.id,
        roleType: "DOCTOR",
        type: "hospital_confirm",
        status: result.ok ? "approved" : "pending",
        documentData: result,
        notes: result.reason,
      });
      if (result.ok && "hospitalName" in result) {
        const match = hospitals.find((h) => h.name === result.hospitalName);
        await prisma.doctorProfile.update({
          where: { userId: session.id },
          data: {
            hospitalConfirmed: true,
            hospitalConfirmedById: match?.userId,
          },
        });
        // Also mark doctor verified when license + gov + hospital all pass
        const updated = await prisma.doctorProfile.findUnique({ where: { userId: session.id } });
        if (updated?.licenseVerified && updated.govDbVerified && updated.hospitalConfirmed) {
          await prisma.doctorProfile.update({
            where: { userId: session.id },
            data: { verified: true },
          });
          await prisma.user.update({ where: { id: session.id }, data: { verified: true } });
        }
      } else {
        // Notify hospital accounts for manual confirmation
        for (const h of hospitals.slice(0, 5)) {
          await prisma.notification.create({
            data: {
              userId: h.userId,
              email: "hospital@medcare.local",
              subject: "Doctor affiliation confirmation requested",
              body: `Doctor ${session.name} requests confirmation of affiliation: ${affiliation}`,
            },
          });
        }
      }
      await audit(session.id, "verify.hospital_confirm_request", "DoctorProfile");
      return NextResponse.json({ ok: true, result, verificationId: record.id });
    }

    if (action === "hospital_confirm_doctor") {
      if (session.role !== Role.HOSPITAL && session.role !== Role.ADMIN && session.role !== Role.DEVELOPER) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const doctorUserId = String(body.doctorUserId || "");
      await prisma.doctorProfile.update({
        where: { userId: doctorUserId },
        data: {
          hospitalConfirmed: true,
          hospitalConfirmedById: session.id,
        },
      });
      const updated = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
      if (updated?.licenseVerified && updated.govDbVerified && updated.hospitalConfirmed) {
        await prisma.doctorProfile.update({
          where: { userId: doctorUserId },
          data: { verified: true },
        });
        await prisma.user.update({ where: { id: doctorUserId }, data: { verified: true } });
      }
      await prisma.identityVerification.updateMany({
        where: { userId: doctorUserId, type: "hospital_confirm", status: "pending" },
        data: {
          status: "approved",
          verifiedAt: new Date(),
          reviewedById: session.id,
          notes: "Confirmed by hospital",
        },
      });
      await audit(session.id, "verify.hospital_confirm", "DoctorProfile", doctorUserId);
      return NextResponse.json({ ok: true });
    }

    if (action === "hospital_business_reg") {
      const reg = String(body.businessRegistration || "");
      const result = verifyBusinessRegistration(reg);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      await prisma.hospitalProfile.upsert({
        where: { userId: session.id },
        update: { businessRegistration: reg, businessRegVerified: true },
        create: {
          userId: session.id,
          name: body.name || session.name,
          businessRegistration: reg,
          businessRegVerified: true,
        },
      });
      await maybeApproveHospital(session.id);
      await createVerificationRecord({
        userId: session.id,
        roleType: "HOSPITAL",
        type: "business_reg",
        status: "approved",
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.business_reg", "HospitalProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "hospital_medical_institution") {
      const reg = String(body.medicalInstitutionReg || "");
      const result = verifyMedicalInstitution(reg);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      await prisma.hospitalProfile.upsert({
        where: { userId: session.id },
        update: { medicalInstitutionReg: reg, medicalInstitutionVerified: true },
        create: {
          userId: session.id,
          name: body.name || session.name,
          medicalInstitutionReg: reg,
          medicalInstitutionVerified: true,
        },
      });
      await maybeApproveHospital(session.id);
      await createVerificationRecord({
        userId: session.id,
        roleType: "HOSPITAL",
        type: "medical_institution",
        status: "approved",
        documentData: result,
        notes: result.reason,
      });
      await audit(session.id, "verify.medical_institution", "HospitalProfile");
      return NextResponse.json({ ok: true, result });
    }

    if (action === "company_business_reg") {
      const reg = String(body.businessRegistration || "");
      const result = verifyBusinessRegistration(reg);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      await prisma.companyProfile.upsert({
        where: { userId: session.id },
        update: { businessRegistration: reg, businessRegVerified: true },
        create: {
          userId: session.id,
          name: body.name || session.name,
          businessRegistration: reg,
          businessRegVerified: true,
        },
      });
      await maybeApproveCompany(session.id);
      await createVerificationRecord({
        userId: session.id,
        roleType: "COMPANY",
        type: "business_reg",
        status: "approved",
        documentData: result,
        notes: result.reason,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === "company_tax_id") {
      const taxId = String(body.taxId || "");
      const result = verifyTaxId(taxId);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      await prisma.companyProfile.upsert({
        where: { userId: session.id },
        update: { taxId, taxIdVerified: true },
        create: {
          userId: session.id,
          name: body.name || session.name,
          taxId,
          taxIdVerified: true,
        },
      });
      await maybeApproveCompany(session.id);
      await createVerificationRecord({
        userId: session.id,
        roleType: "COMPANY",
        type: "tax_id",
        status: "approved",
        documentData: result,
        notes: result.reason,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === "admin_review") {
      await requirePermission(PERMISSIONS.USERS_MANAGE);
      const verification = await prisma.identityVerification.update({
        where: { id: body.verificationId },
        data: {
          status: body.approve ? "approved" : "rejected",
          notes: body.notes || undefined,
          reviewedById: session.id,
          verifiedAt: body.approve ? new Date() : null,
        },
      });
      return NextResponse.json({ verification });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

async function maybeApproveHospital(userId: string) {
  const p = await prisma.hospitalProfile.findUnique({ where: { userId } });
  if (p?.businessRegVerified && p.medicalInstitutionVerified) {
    await prisma.hospitalProfile.update({
      where: { userId },
      data: { verified: true },
    });
    await prisma.user.update({ where: { id: userId }, data: { verified: true } });
  }
}

async function maybeApproveCompany(userId: string) {
  const p = await prisma.companyProfile.findUnique({ where: { userId } });
  if (p?.businessRegVerified && p.taxIdVerified) {
    await prisma.companyProfile.update({
      where: { userId },
      data: { verified: true },
    });
    await prisma.user.update({ where: { id: userId }, data: { verified: true } });
  }
}
