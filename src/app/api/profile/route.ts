import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  return Boolean(v);
}

async function loadHistories(userId: string, role: Role) {
  const now = new Date();

  if (role === Role.PATIENT) {
    const [appointments, prescriptions, reviews, subscriptions, aiConsultations, chatThreads] =
      await Promise.all([
        prisma.appointment.findMany({
          where: { patientId: userId },
          include: {
            doctor: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: "desc" },
          take: 50,
        }),
        prisma.prescription.findMany({
          where: { patientId: userId },
          include: { doctor: { select: { name: true } } },
          orderBy: { issuedAt: "desc" },
          take: 50,
        }),
        prisma.review.findMany({
          where: { authorId: userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.subscription.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.aiConsultation.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.chatThread.findMany({
          where: {
            OR: [{ participantAId: userId }, { participantBId: userId }],
          },
          include: {
            participantA: { select: { id: true, name: true } },
            participantB: { select: { id: true, name: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
      ]);

    return {
      appointments,
      prescriptions,
      reviews,
      subscriptions,
      aiConsultations,
      chatThreads,
      chatThreadsCount: chatThreads.length,
    };
  }

  if (role === Role.DOCTOR) {
    const [appointments, prescriptions] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId: userId, scheduledAt: { gte: now }, status: "BOOKED" },
        include: { patient: { select: { id: true, name: true, email: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.prescription.findMany({
        where: { doctorId: userId },
        include: { patient: { select: { name: true } } },
        orderBy: { issuedAt: "desc" },
        take: 50,
      }),
    ]);
    return { waitingPatients: appointments, prescriptions };
  }

  if (role === Role.NURSE) {
    const profile = await prisma.nurseProfile.findUnique({ where: { userId } });
    const appointments = profile?.hospitalAffiliation
      ? await prisma.appointment.findMany({
          where: {
            status: "BOOKED",
            scheduledAt: { gte: now },
            OR: [
              {
                doctor: {
                  doctorProfile: {
                    hospitalAffiliation: profile.hospitalAffiliation,
                  },
                },
              },
            ],
          },
          include: {
            patient: { select: { id: true, name: true } },
            doctor: { select: { name: true } },
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
        })
      : [];
    return { appointments };
  }

  if (role === Role.HOSPITAL) {
    const profile = await prisma.hospitalProfile.findUnique({ where: { userId } });
    const [appointments, doctorCount, nurseCount] = await Promise.all([
      prisma.appointment.findMany({
        where: { hospitalId: userId },
        include: {
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      prisma.user.count({ where: { role: Role.DOCTOR } }),
      prisma.user.count({ where: { role: Role.NURSE } }),
    ]);
    return {
      appointments,
      counts: {
        appointments: appointments.length,
        doctorsInPlatform: doctorCount,
        nursesInPlatform: nurseCount,
        icuBeds: profile?.icuBeds ?? 0,
        totalBeds: profile?.totalBeds ?? 0,
        operatingRooms: profile?.operatingRooms ?? 0,
      },
    };
  }

  if (role === Role.PHARMACY) {
    const profile = await prisma.pharmacyProfile.findUnique({
      where: { userId },
      include: { medicines: { orderBy: { name: "asc" } } },
    });
    const prescriptions = profile
      ? await prisma.prescription.findMany({
          where: { pharmacyId: profile.id },
          include: {
            patient: { select: { name: true } },
            doctor: { select: { name: true } },
          },
          orderBy: { issuedAt: "desc" },
          take: 50,
        })
      : [];
    return { medicines: profile?.medicines ?? [], prescriptions };
  }

  if (role === Role.COMPANY) {
    const profile = await prisma.companyProfile.findUnique({ where: { userId } });
    return { profile };
  }

  return {};
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      bio: true,
      photoUrl: true,
      locale: true,
      gender: true,
      dateOfBirth: true,
      role: true,
      verified: true,
      patientProfile: true,
      doctorProfile: true,
      nurseProfile: true,
      hospitalProfile: true,
      pharmacyProfile: { include: { medicines: true } },
      companyProfile: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const histories = await loadHistories(session.id, session.role);

  return NextResponse.json({ user, histories });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    if (body.action === "set_locale") {
      const locale = String(body.locale || "ja");
      await prisma.user.update({ where: { id: session.id }, data: { locale } });
      await audit(session.id, "profile.set_locale", "User", locale);
      const updated = await prisma.user.findUnique({ where: { id: session.id } });
      return NextResponse.json({ ok: true, locale: updated?.locale });
    }

    if (body.action === "update_profile") {
      const data: {
        name?: string;
        bio?: string;
        photoUrl?: string;
        phone?: string;
        gender?: string | null;
        dateOfBirth?: Date | null;
      } = {};
      if (body.name !== undefined) data.name = str(body.name);
      if (body.bio !== undefined) data.bio = str(body.bio);
      if (body.photoUrl !== undefined) data.photoUrl = str(body.photoUrl);
      if (body.phone !== undefined) data.phone = str(body.phone);
      if (body.gender !== undefined) data.gender = str(body.gender) || null;
      if (body.dateOfBirth !== undefined) {
        const raw = str(body.dateOfBirth);
        data.dateOfBirth = raw ? new Date(raw) : null;
      }

      const user = await prisma.user.update({ where: { id: session.id }, data });
      await audit(session.id, "profile.update", "User");
      return NextResponse.json({ user });
    }

    if (body.action === "update_patient") {
      if (session.role !== Role.PATIENT) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.patientProfile.upsert({
        where: { userId: session.id },
        update: {
          bloodType: str(body.bloodType),
          allergies: str(body.allergies),
          medications: str(body.medications),
          medicalHistory: str(body.medicalHistory),
          insuranceInfo: str(body.insuranceInfo),
          incomeBracket: str(body.incomeBracket),
          preferredLanguage: str(body.preferredLanguage),
          familyDoctor: str(body.familyDoctor),
          emergencyContact: str(body.emergencyContact),
          favoriteHospitals: str(body.favoriteHospitals),
          favoriteDoctors: str(body.favoriteDoctors),
          paymentMethods: str(body.paymentMethods),
        },
        create: {
          userId: session.id,
          bloodType: str(body.bloodType),
          allergies: str(body.allergies),
          medications: str(body.medications),
          medicalHistory: str(body.medicalHistory),
          insuranceInfo: str(body.insuranceInfo),
          incomeBracket: str(body.incomeBracket),
          preferredLanguage: str(body.preferredLanguage),
          familyDoctor: str(body.familyDoctor),
          emergencyContact: str(body.emergencyContact),
          favoriteHospitals: str(body.favoriteHospitals),
          favoriteDoctors: str(body.favoriteDoctors),
          paymentMethods: str(body.paymentMethods),
        },
      });
      await audit(session.id, "profile.update_patient", "PatientProfile");
      return NextResponse.json({ profile });
    }

    if (body.action === "update_doctor") {
      if (session.role !== Role.DOCTOR) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.doctorProfile.upsert({
        where: { userId: session.id },
        update: {
          licenseNumber: str(body.licenseNumber),
          nationalRegNumber: str(body.nationalRegNumber),
          university: str(body.university),
          graduationYear: num(body.graduationYear),
          boardCertifications: str(body.boardCertifications),
          specialty: str(body.specialty),
          subspecialty: str(body.subspecialty),
          clinicalExperience: str(body.clinicalExperience),
          yearsExperience: num(body.yearsExperience),
          treatmentMethods: str(body.treatmentMethods),
          successRate: num(body.successRate),
          hospitalAffiliation: str(body.hospitalAffiliation),
          languages: str(body.languages),
          awards: str(body.awards),
          publications: str(body.publications),
          research: str(body.research),
          consultationFee: num(body.consultationFee),
          schedule: str(body.schedule),
          onlineAvailable: bool(body.onlineAvailable) ?? true,
          offlineAvailable: bool(body.offlineAvailable) ?? true,
        },
        create: {
          userId: session.id,
          licenseNumber: str(body.licenseNumber),
          nationalRegNumber: str(body.nationalRegNumber),
          university: str(body.university),
          graduationYear: num(body.graduationYear),
          boardCertifications: str(body.boardCertifications),
          specialty: str(body.specialty),
          subspecialty: str(body.subspecialty),
          clinicalExperience: str(body.clinicalExperience),
          yearsExperience: num(body.yearsExperience),
          treatmentMethods: str(body.treatmentMethods),
          successRate: num(body.successRate),
          hospitalAffiliation: str(body.hospitalAffiliation),
          languages: str(body.languages),
          awards: str(body.awards),
          publications: str(body.publications),
          research: str(body.research),
          consultationFee: num(body.consultationFee),
          schedule: str(body.schedule),
          onlineAvailable: bool(body.onlineAvailable) ?? true,
          offlineAvailable: bool(body.offlineAvailable) ?? true,
        },
      });
      await audit(session.id, "profile.update_doctor", "DoctorProfile");
      return NextResponse.json({ profile });
    }

    if (body.action === "update_nurse") {
      if (session.role !== Role.NURSE) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.nurseProfile.upsert({
        where: { userId: session.id },
        update: {
          licenseNumber: str(body.licenseNumber),
          nationalRegNumber: str(body.nationalRegNumber),
          university: str(body.university),
          graduationYear: num(body.graduationYear),
          boardCertifications: str(body.boardCertifications),
          specialty: str(body.specialty),
          subspecialty: str(body.subspecialty),
          clinicalExperience: str(body.clinicalExperience),
          yearsExperience: num(body.yearsExperience),
          treatmentMethods: str(body.treatmentMethods),
          successRate: num(body.successRate),
          hospitalAffiliation: str(body.hospitalAffiliation),
          languages: str(body.languages),
          awards: str(body.awards),
          publications: str(body.publications),
          research: str(body.research),
          consultationFee: num(body.consultationFee),
          schedule: str(body.schedule),
          certifications: str(body.certifications),
          clinicalSpecialties: str(body.clinicalSpecialties),
          shiftAvailability: str(body.shiftAvailability),
          homeVisitAvailable: bool(body.homeVisitAvailable) ?? false,
          onlineAvailable: bool(body.onlineAvailable) ?? true,
          offlineAvailable: bool(body.offlineAvailable) ?? true,
        },
        create: {
          userId: session.id,
          licenseNumber: str(body.licenseNumber),
          nationalRegNumber: str(body.nationalRegNumber),
          university: str(body.university),
          graduationYear: num(body.graduationYear),
          boardCertifications: str(body.boardCertifications),
          specialty: str(body.specialty),
          subspecialty: str(body.subspecialty),
          clinicalExperience: str(body.clinicalExperience),
          yearsExperience: num(body.yearsExperience),
          treatmentMethods: str(body.treatmentMethods),
          successRate: num(body.successRate),
          hospitalAffiliation: str(body.hospitalAffiliation),
          languages: str(body.languages),
          awards: str(body.awards),
          publications: str(body.publications),
          research: str(body.research),
          consultationFee: num(body.consultationFee),
          schedule: str(body.schedule),
          certifications: str(body.certifications),
          clinicalSpecialties: str(body.clinicalSpecialties),
          shiftAvailability: str(body.shiftAvailability),
          homeVisitAvailable: bool(body.homeVisitAvailable) ?? false,
          onlineAvailable: bool(body.onlineAvailable) ?? true,
          offlineAvailable: bool(body.offlineAvailable) ?? true,
        },
      });
      await audit(session.id, "profile.update_nurse", "NurseProfile");
      return NextResponse.json({ profile });
    }

    if (body.action === "update_hospital") {
      if (session.role !== Role.HOSPITAL) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.hospitalProfile.upsert({
        where: { userId: session.id },
        update: {
          name: str(body.name) || "Hospital",
          departments: str(body.departments),
          equipment: str(body.equipment),
          operatingHours: str(body.operatingHours),
          emergencyAvailable: bool(body.emergencyAvailable) ?? false,
          icuBeds: num(body.icuBeds) ?? 0,
          totalBeds: num(body.totalBeds) ?? 0,
          operatingRooms: num(body.operatingRooms) ?? 0,
          parking: bool(body.parking) ?? false,
          acceptedInsurance: str(body.acceptedInsurance),
          languages: str(body.languages),
          pharmacyOnSite: bool(body.pharmacyOnSite) ?? false,
          ambulance: bool(body.ambulance) ?? false,
          accreditation: str(body.accreditation),
          businessRegistration: str(body.businessRegistration),
          medicalInstitutionReg: str(body.medicalInstitutionReg),
          treatmentMethods: str(body.treatmentMethods),
          address: str(body.address),
          latitude: num(body.latitude) ?? undefined,
          longitude: num(body.longitude) ?? undefined,
          doctorsList: str(body.doctorsList),
          nursesList: str(body.nursesList),
        },
        create: {
          userId: session.id,
          name: str(body.name) || "Hospital",
          departments: str(body.departments),
          equipment: str(body.equipment),
          operatingHours: str(body.operatingHours),
          emergencyAvailable: bool(body.emergencyAvailable) ?? false,
          icuBeds: num(body.icuBeds) ?? 0,
          totalBeds: num(body.totalBeds) ?? 0,
          operatingRooms: num(body.operatingRooms) ?? 0,
          parking: bool(body.parking) ?? false,
          acceptedInsurance: str(body.acceptedInsurance),
          languages: str(body.languages),
          pharmacyOnSite: bool(body.pharmacyOnSite) ?? false,
          ambulance: bool(body.ambulance) ?? false,
          accreditation: str(body.accreditation),
          businessRegistration: str(body.businessRegistration),
          medicalInstitutionReg: str(body.medicalInstitutionReg),
          treatmentMethods: str(body.treatmentMethods),
          address: str(body.address),
          latitude: num(body.latitude) ?? undefined,
          longitude: num(body.longitude) ?? undefined,
          doctorsList: str(body.doctorsList),
          nursesList: str(body.nursesList),
        },
      });
      await audit(session.id, "profile.update_hospital", "HospitalProfile");
      return NextResponse.json({ profile });
    }

    if (body.action === "update_pharmacy") {
      if (session.role !== Role.PHARMACY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.pharmacyProfile.upsert({
        where: { userId: session.id },
        update: {
          name: str(body.name) || "Pharmacy",
          deliveryAvailable: bool(body.deliveryAvailable) ?? true,
          pickupAvailable: bool(body.pickupAvailable) ?? true,
          prescriptionSupport: bool(body.prescriptionSupport) ?? true,
          discounts: str(body.discounts),
        },
        create: {
          userId: session.id,
          name: str(body.name) || "Pharmacy",
          deliveryAvailable: bool(body.deliveryAvailable) ?? true,
          pickupAvailable: bool(body.pickupAvailable) ?? true,
          prescriptionSupport: bool(body.prescriptionSupport) ?? true,
          discounts: str(body.discounts),
        },
      });
      await audit(session.id, "profile.update_pharmacy", "PharmacyProfile");
      return NextResponse.json({ profile });
    }

    if (body.action === "upsert_medicine") {
      if (session.role !== Role.PHARMACY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const pharmacy = await prisma.pharmacyProfile.findUnique({ where: { userId: session.id } });
      if (!pharmacy) {
        return NextResponse.json({ error: "Pharmacy profile required" }, { status: 400 });
      }
      const medicineData = {
        pharmacyId: pharmacy.id,
        name: String(body.name || "Medicine"),
        manufacturer: str(body.manufacturer),
        ingredients: str(body.ingredients),
        interactions: str(body.interactions),
        warnings: str(body.warnings),
        alternatives: str(body.alternatives),
        imageUrl: str(body.imageUrl),
        priceYen: num(body.priceYen) ?? 0,
        stock: num(body.stock) ?? 0,
      };
      const medicine = body.id
        ? await prisma.medicine.update({
            where: { id: String(body.id) },
            data: medicineData,
          })
        : await prisma.medicine.create({ data: medicineData });
      await audit(session.id, "profile.upsert_medicine", "Medicine", medicine.id);
      return NextResponse.json({ medicine });
    }

    if (body.action === "delete_medicine") {
      if (session.role !== Role.PHARMACY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await prisma.medicine.delete({ where: { id: String(body.id) } });
      await audit(session.id, "profile.delete_medicine", "Medicine", String(body.id));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update_company") {
      if (session.role !== Role.COMPANY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const profile = await prisma.companyProfile.upsert({
        where: { userId: session.id },
        update: {
          name: str(body.name) || "Company",
          taxId: str(body.taxId),
          businessRegistration: str(body.businessRegistration),
          employeeCount: num(body.employeeCount) ?? 0,
          employeesJson: str(body.employeesJson),
          healthCheckSchedule: str(body.healthCheckSchedule),
          medicalReports: str(body.medicalReports),
          healthCampaigns: str(body.healthCampaigns),
          vaccinationPrograms: str(body.vaccinationPrograms),
          insuranceSupport: str(body.insuranceSupport),
        },
        create: {
          userId: session.id,
          name: str(body.name) || "Company",
          taxId: str(body.taxId),
          businessRegistration: str(body.businessRegistration),
          employeeCount: num(body.employeeCount) ?? 0,
          employeesJson: str(body.employeesJson),
          healthCheckSchedule: str(body.healthCheckSchedule),
          medicalReports: str(body.medicalReports),
          healthCampaigns: str(body.healthCampaigns),
          vaccinationPrograms: str(body.vaccinationPrograms),
          insuranceSupport: str(body.insuranceSupport),
        },
      });
      await audit(session.id, "profile.update_company", "CompanyProfile");
      return NextResponse.json({ profile });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
