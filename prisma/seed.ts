import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ADMIN_PERMISSIONS,
  DEVELOPER_PERMISSIONS,
  PLATFORM_FEATURES,
  PERMISSIONS,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

const avatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1ec8a5&color=04221b&size=128`;

async function upsertPermission(key: string, description: string) {
  return prisma.permission.upsert({
    where: { key },
    update: { description },
    create: { key, description },
  });
}

async function assignPermissions(userId: string, keys: string[]) {
  for (const key of keys) {
    const perm = await prisma.permission.findUnique({ where: { key } });
    if (!perm) continue;
    await prisma.userPermission.upsert({
      where: { userId_permissionId: { userId, permissionId: perm.id } },
      update: { enabled: true },
      create: { userId, permissionId: perm.id, enabled: true },
    });
  }
}

async function main() {
  console.log("Seeding MedCare platform...");

  for (const key of Object.values(PERMISSIONS)) {
    await upsertPermission(key, key);
  }

  for (const f of PLATFORM_FEATURES) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { name: f.name, description: f.description, category: f.category },
      create: {
        key: f.key,
        name: f.name,
        description: f.description,
        category: f.category,
        enabled: true,
      },
    });
  }

  const devHash = await bcrypt.hash("MedCare!2026", 10);
  const developer = await prisma.user.upsert({
    where: { email: "developer@medcare.local" },
    update: {
      role: Role.DEVELOPER,
      active: true,
      verified: true,
      passwordHash: devHash,
      photoUrl: avatar("Platform Developer"),
      bio: "Full platform access including archive.",
    },
    create: {
      email: "developer@medcare.local",
      name: "Platform Developer",
      role: Role.DEVELOPER,
      passwordHash: devHash,
      active: true,
      verified: true,
      photoUrl: avatar("Platform Developer"),
      bio: "Full platform access including archive.",
    },
  });
  await assignPermissions(developer.id, DEVELOPER_PERMISSIONS);

  const admin = await prisma.user.upsert({
    where: { email: "admin@medcare.local" },
    update: {
      role: Role.ADMIN,
      active: true,
      verified: true,
      passwordHash: devHash,
      photoUrl: avatar("Platform Administrator"),
      bio: "Administration without archive access.",
    },
    create: {
      email: "admin@medcare.local",
      name: "Platform Administrator",
      role: Role.ADMIN,
      passwordHash: devHash,
      active: true,
      verified: true,
      photoUrl: avatar("Platform Administrator"),
      bio: "Administration without archive access.",
    },
  });
  await assignPermissions(admin.id, ADMIN_PERMISSIONS);

  const patientHash = await bcrypt.hash("Patient!2026", 10);
  const patient = await prisma.user.upsert({
    where: { email: "patient@medcare.local" },
    update: {
      photoUrl: avatar("Yuki Tanaka"),
      bio: "Patient advocate for accessible care.",
    },
    create: {
      email: "patient@medcare.local",
      name: "Yuki Tanaka",
      role: Role.PATIENT,
      passwordHash: patientHash,
      active: true,
      verified: true,
      photoUrl: avatar("Yuki Tanaka"),
      bio: "Patient advocate for accessible care.",
      patientProfile: {
        create: {
          bloodType: "A+",
          allergies: "Penicillin",
          insuranceInfo: "Japan National Health Insurance",
        },
      },
      ehr: {
        create: {
          diagnoses: "Mild hypertension",
          vaccinations: "COVID-19, Influenza 2025",
        },
      },
    },
  });

  const doctorHash = await bcrypt.hash("Doctor!2026", 10);
  const doctor = await prisma.user.upsert({
    where: { email: "doctor@medcare.local" },
    update: {
      photoUrl: avatar("Dr Kenji Sato"),
      bio: "Internal medicine specialist, Tokyo.",
    },
    create: {
      email: "doctor@medcare.local",
      name: "Dr. Kenji Sato",
      role: Role.DOCTOR,
      passwordHash: doctorHash,
      active: true,
      verified: true,
      photoUrl: avatar("Dr Kenji Sato"),
      bio: "Internal medicine specialist, Tokyo.",
      doctorProfile: {
        create: {
          licenseNumber: "MD-JP-102938",
          specialty: "Internal Medicine",
          university: "University of Tokyo",
          graduationYear: 2008,
          consultationFee: 5000,
          verified: true,
          languages: "Japanese, English",
        },
      },
    },
  });

  const nurseHash = await bcrypt.hash("Nurse!2026", 10);
  const nurse = await prisma.user.upsert({
    where: { email: "nurse@medcare.local" },
    update: { photoUrl: avatar("Sakura Ito") },
    create: {
      email: "nurse@medcare.local",
      name: "Sakura Ito",
      role: Role.NURSE,
      passwordHash: nurseHash,
      active: true,
      verified: true,
      photoUrl: avatar("Sakura Ito"),
      bio: "Clinical nurse specialist.",
      nurseProfile: {
        create: {
          certifications: "RN, BSN",
          clinicalSpecialties: "Emergency, Home visit",
          verified: true,
        },
      },
    },
  });

  const hospitalHash = await bcrypt.hash("Hospital!2026", 10);
  await prisma.user.upsert({
    where: { email: "hospital@medcare.local" },
    update: { photoUrl: avatar("Tokyo Central") },
    create: {
      email: "hospital@medcare.local",
      name: "Tokyo Central Hospital Admin",
      role: Role.HOSPITAL,
      passwordHash: hospitalHash,
      active: true,
      verified: true,
      photoUrl: avatar("Tokyo Central"),
      hospitalProfile: {
        create: {
          name: "Tokyo Central Hospital",
          departments: "Cardiology, ER, Internal Medicine",
          emergencyAvailable: true,
          icuBeds: 24,
          totalBeds: 450,
          operatingRooms: 8,
          verified: true,
          operatingHours: "24/7",
        },
      },
    },
  });

  const companyHash = await bcrypt.hash("Company!2026", 10);
  await prisma.user.upsert({
    where: { email: "company@medcare.local" },
    update: { photoUrl: avatar("MedCorp HR") },
    create: {
      email: "company@medcare.local",
      name: "MedCorp HR",
      role: Role.COMPANY,
      passwordHash: companyHash,
      active: true,
      verified: true,
      photoUrl: avatar("MedCorp HR"),
      companyProfile: {
        create: {
          name: "MedCorp Industries",
          employeeCount: 1200,
          verified: true,
        },
      },
    },
  });

  const pharmacyHash = await bcrypt.hash("Pharmacy!2026", 10);
  const pharmacyUser = await prisma.user.upsert({
    where: { email: "pharmacy@medcare.local" },
    update: {
      role: Role.PHARMACY,
      active: true,
      verified: true,
      passwordHash: pharmacyHash,
      photoUrl: avatar("Shinjuku Pharmacy"),
    },
    create: {
      email: "pharmacy@medcare.local",
      name: "Shinjuku Pharmacy Admin",
      role: Role.PHARMACY,
      passwordHash: pharmacyHash,
      active: true,
      verified: true,
      photoUrl: avatar("Shinjuku Pharmacy"),
      pharmacyProfile: {
        create: {
          name: "Shinjuku Central Pharmacy",
          deliveryAvailable: true,
          pickupAvailable: true,
          prescriptionSupport: true,
        },
      },
    },
  });

  const pharmacyProfile = await prisma.pharmacyProfile.upsert({
    where: { userId: pharmacyUser.id },
    update: { name: "Shinjuku Central Pharmacy" },
    create: {
      userId: pharmacyUser.id,
      name: "Shinjuku Central Pharmacy",
      deliveryAvailable: true,
      pickupAvailable: true,
      prescriptionSupport: true,
    },
  });
    await prisma.medicine.deleteMany({ where: { pharmacyId: pharmacyProfile.id } });
    await prisma.medicine.createMany({
      data: [
        {
          pharmacyId: pharmacyProfile.id,
          name: "Lisinopril 10mg",
          manufacturer: "MedGen Pharma",
          priceYen: 980,
          stock: 120,
          imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
          ingredients: "Lisinopril",
          warnings: "Consult physician if pregnant",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Ibuprofen 200mg",
          manufacturer: "PainAway Co",
          priceYen: 450,
          stock: 200,
          imageUrl: "https://images.unsplash.com/photo-1471864190281-a93a3070bfe6?w=400&q=80",
          ingredients: "Ibuprofen",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Metformin 500mg",
          manufacturer: "DiabeCare",
          priceYen: 720,
          stock: 85,
          imageUrl: "https://images.unsplash.com/photo-1587854691652-5c651a388a2a?w=400&q=80",
          ingredients: "Metformin HCl",
        },
      ],
    });

  await prisma.prescription.deleteMany({ where: { patientId: patient.id } });
  await prisma.prescription.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      pharmacyId: pharmacyProfile.id,
      medication: "Lisinopril 10mg",
      dosage: "1 tablet daily",
      status: "APPROVED",
    },
  });

  await prisma.communityPost.deleteMany({});
  await prisma.communityPost.createMany({
    data: [
      {
        authorId: patient.id,
        title: "Tips for home blood pressure monitoring",
        body: "I log readings every morning before coffee — sharing what worked for me.",
        topic: "hypertension",
        likeCount: 5,
      },
      {
        authorId: doctor.id,
        title: "When to seek urgent care for fever",
        body: "Persistent high fever over 39°C with confusion warrants immediate evaluation.",
        topic: "fever",
        likeCount: 12,
      },
    ],
  });

  await prisma.invoice.deleteMany({ where: { userId: patient.id } });
  await prisma.invoice.createMany({
    data: [
      {
        userId: patient.id,
        amountYen: 5000,
        description: "Telemedicine consultation — Dr. Sato",
        status: "OPEN",
      },
      {
        userId: patient.id,
        amountYen: 1000,
        description: "MedCare Individual subscription",
        status: "PAID",
        paidAt: new Date(),
        providerRef: "mock_seed_paid",
      },
    ],
  });

  const existingTele = await prisma.telemedicineSession.count();
  if (existingTele === 0) {
    await prisma.telemedicineSession.create({
      data: {
        hostId: doctor.id,
        patientId: patient.id,
        roomUrl: `https://meet.jit.si/medcare-seed-demo`,
        provider: "mock",
        status: "scheduled",
        recordingConsent: true,
      },
    });
  }

  await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      type: "VIDEO",
      status: "BOOKED",
      scheduledAt: new Date(Date.now() + 86400000 * 3),
      notes: "Follow-up hypertension check",
    },
  });

  await prisma.supportTicket.deleteMany({});
  await prisma.supportTicket.create({
    data: {
      userId: patient.id,
      name: patient.name,
      email: patient.email,
      subject: "Billing question",
      body: "Can I get a receipt for my last subscription payment?",
      status: "open",
    },
  });

  const existingReviews = await prisma.platformReview.count();
  if (existingReviews === 0) {
    await prisma.platformReview.createMany({
      data: [
        {
          authorId: patient.id,
          rating: 5,
          comment: "MedCare made booking my specialist effortless.",
        },
        {
          authorId: admin.id,
          rating: 5,
          comment: "Enterprise-grade controls with a humane patient experience.",
        },
        {
          authorId: developer.id,
          rating: 5,
          comment: "Let's save the world — one compliant deployment at a time.",
        },
      ],
    });
  }

  await prisma.review.deleteMany({
    where: {
      OR: [
        { authorId: patient.id, targetId: doctor.id },
        { authorId: doctor.id, targetId: patient.id },
      ],
    },
  });

  await prisma.review.create({
    data: {
      authorId: patient.id,
      targetType: "user",
      targetId: doctor.id,
      rating: 5,
      comment: "Dr. Sato listened carefully and explained my treatment plan clearly.",
      verified: true,
    },
  });

  await prisma.review.create({
    data: {
      authorId: doctor.id,
      targetType: "user",
      targetId: patient.id,
      rating: 5,
      comment: "Yuki followed medication guidance and kept accurate symptom logs.",
      verified: true,
    },
  });

  const coverImages = [
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80",
    "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80",
    "https://images.unsplash.com/photo-1505751172878-fa1923c5c528?w=800&q=80",
  ];

  await prisma.blogPost.deleteMany({});
  const blog1 = await prisma.blogPost.create({
    data: {
      authorId: developer.id,
      title: "Welcome to MedCare — Let's Save the World",
      content:
        "MedCare connects patients, doctors, hospitals, pharmacies, and employers across Japan with AI-assisted care pathways and compliant data handling.",
      coverImage: coverImages[0],
      tags: "announcement,platform",
      published: true,
      viewCount: 42,
      likeCount: 12,
    },
  });
  const blog2 = await prisma.blogPost.create({
    data: {
      authorId: admin.id,
      title: "Telemedicine Consent Best Practices",
      content:
        "Before a video consultation, patients must provide explicit consent for recording and prescription issuance. This article outlines the workflow.",
      coverImage: coverImages[1],
      tags: "telemedicine,compliance",
      published: true,
      viewCount: 28,
      likeCount: 8,
    },
  });
  const blog3 = await prisma.blogPost.create({
    data: {
      authorId: doctor.id,
      title: "Managing Hypertension at Home",
      content:
        "Lifestyle changes, home monitoring, and when to seek urgent care — a practical guide for patients and caregivers.",
      coverImage: coverImages[2],
      tags: "hypertension,patient-education",
      published: true,
      viewCount: 35,
      likeCount: 15,
    },
  });

  const viewers = [patient, doctor, nurse, admin, developer];
  for (const post of [blog1, blog2, blog3]) {
    for (const viewer of viewers.slice(0, 3 + (post.viewCount % 3))) {
      await prisma.blogView.upsert({
        where: { postId_viewerId: { postId: post.id, viewerId: viewer.id } },
        update: {},
        create: { postId: post.id, viewerId: viewer.id },
      });
    }
  }

  const comment1 = await prisma.blogComment.create({
    data: {
      postId: blog1.id,
      authorId: patient.id,
      body: "Excellent overview — very helpful for new patients.",
      rating: 5,
    },
  });
  await prisma.blogComment.create({
    data: {
      postId: blog1.id,
      authorId: doctor.id,
      body: "Agree — we use this with our clinic onboarding.",
      parentId: comment1.id,
      rating: 5,
    },
  });
  await prisma.blogComment.create({
    data: {
      postId: blog3.id,
      authorId: patient.id,
      body: "Clear advice on home blood pressure monitoring.",
      rating: 4,
    },
  });

  const blogStats = {
    totalViews: 42 + 28 + 35,
    totalSubscribers: 0,
    postStats: {
      [blog1.id]: { views: 42, uniqueViewers: 3 },
      [blog2.id]: { views: 28, uniqueViewers: 3 },
      [blog3.id]: { views: 35, uniqueViewers: 3 },
    },
    updatedAt: new Date().toISOString(),
  };

  await prisma.archive.deleteMany({});
  await prisma.archive.create({
    data: {
      name: "Platform Master Archive",
      description: "Canonical platform configuration archive",
      payload: JSON.stringify({
        version: 1,
        modules: PLATFORM_FEATURES.map((f) => f.key),
        blogStats,
        seededAt: new Date().toISOString(),
      }),
      version: 1,
      initialized: true,
      createdById: developer.id,
      updatedById: developer.id,
    },
  });

  console.log("Seed complete.");
  console.log("Accounts:");
  console.log("  developer@medcare.local / MedCare!2026");
  console.log("  admin@medcare.local     / MedCare!2026");
  console.log("  patient@medcare.local   / Patient!2026");
  console.log("  doctor@medcare.local    / Doctor!2026");
  console.log("  nurse@medcare.local     / Nurse!2026");
  console.log("  hospital@medcare.local  / Hospital!2026");
  console.log("  company@medcare.local   / Company!2026");
  console.log("  pharmacy@medcare.local  / Pharmacy!2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
