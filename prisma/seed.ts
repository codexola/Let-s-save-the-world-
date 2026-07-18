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
      phone: "090-1234-5678",
      gender: "female",
      dateOfBirth: new Date("1990-05-14"),
    },
    create: {
      email: "patient@medcare.local",
      name: "Yuki Tanaka",
      role: Role.PATIENT,
      passwordHash: patientHash,
      active: true,
      verified: true,
      phone: "090-1234-5678",
      gender: "female",
      dateOfBirth: new Date("1990-05-14"),
      photoUrl: avatar("Yuki Tanaka"),
      bio: "Patient advocate for accessible care.",
      patientProfile: {
        create: {
          bloodType: "A+",
          allergies: "ペニシリン、そば",
          medications: "アムロジピン 5mg 1日1錠、ロサルタン 50mg 1日1錠",
          medicalHistory: "2019年に軽度の高血圧を診断。2022年にアレルギー性鼻炎の治療歴あり。",
          insuranceInfo: "国民健康保険（東京都世田谷区）",
          incomeBracket: "middle",
          preferredLanguage: "日本語",
          familyDoctor: "Dr. Kenji Sato — 内科",
          emergencyContact: "田中 花子（母）090-9876-5432",
          favoriteHospitals: "Tokyo Central Hospital, 聖路加国際病院",
          favoriteDoctors: "Dr. Kenji Sato, Dr. Yuki Yamada",
          paymentMethods: JSON.stringify([
            { type: "visa", last4: "4242", label: "メインカード" },
            { type: "paypay", label: "PayPay残高" },
          ]),
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

  await prisma.patientProfile.upsert({
    where: { userId: patient.id },
    update: {
      bloodType: "A+",
      allergies: "ペニシリン、そば",
      medications: "アムロジピン 5mg 1日1錠、ロサルタン 50mg 1日1錠",
      medicalHistory: "2019年に軽度の高血圧を診断。2022年にアレルギー性鼻炎の治療歴あり。",
      insuranceInfo: "国民健康保険（東京都世田谷区）",
      incomeBracket: "middle",
      preferredLanguage: "日本語",
      familyDoctor: "Dr. Kenji Sato — 内科",
      emergencyContact: "田中 花子（母）090-9876-5432",
      favoriteHospitals: "Tokyo Central Hospital, 聖路加国際病院",
      favoriteDoctors: "Dr. Kenji Sato, Dr. Yuki Yamada",
      paymentMethods: JSON.stringify([
        { type: "visa", last4: "4242", label: "メインカード" },
        { type: "paypay", label: "PayPay残高" },
      ]),
    },
    create: { userId: patient.id },
  });

  const doctorHash = await bcrypt.hash("Doctor!2026", 10);
  const doctor = await prisma.user.upsert({
    where: { email: "doctor@medcare.local" },
    update: {
      photoUrl: avatar("Dr Kenji Sato"),
      bio: "Internal medicine specialist, Tokyo.",
      phone: "03-5555-0101",
      gender: "male",
    },
    create: {
      email: "doctor@medcare.local",
      name: "Dr. Kenji Sato",
      role: Role.DOCTOR,
      passwordHash: doctorHash,
      active: true,
      verified: true,
      phone: "03-5555-0101",
      gender: "male",
      photoUrl: avatar("Dr Kenji Sato"),
      bio: "Internal medicine specialist, Tokyo.",
      doctorProfile: {
        create: {
          licenseNumber: "MD-JP-102938",
          nationalRegNumber: "医師免許 第123456号",
          specialty: "Internal Medicine",
          subspecialty: "Cardiovascular Medicine",
          university: "東京大学医学部",
          graduationYear: 2008,
          boardCertifications: "日本内科学会認定内科医、日本循環器学会専門医",
          clinicalExperience: "15年以上の総合内科・循環器診療経験。救急外来3年、大学病院8年。",
          yearsExperience: 15,
          treatmentMethods: "ECG, antihypertensive therapy, lifestyle counseling, blood pressure monitoring",
          successRate: 92,
          hospitalAffiliation: "Tokyo Central Hospital",
          consultationFee: 5000,
          verified: true,
          licenseVerified: true,
          govDbVerified: true,
          hospitalConfirmed: true,
          languages: "日本語, English",
          awards: "2023年 東京都優秀医師賞",
          publications: "Hypertension management in elderly patients — JMA 2024",
          research: "高齢者高血圧の長期予後に関するコホート研究",
          schedule: "月・水・金 09:00-17:00\n火・木 13:00-20:00（オンライン）",
          onlineAvailable: true,
          offlineAvailable: true,
        },
      },
    },
  });

  await prisma.doctorProfile.upsert({
    where: { userId: doctor.id },
    update: {
      licenseNumber: "MD-JP-102938",
      nationalRegNumber: "医師免許 第123456号",
      specialty: "Internal Medicine",
      subspecialty: "Cardiovascular Medicine",
      university: "東京大学医学部",
      graduationYear: 2008,
      boardCertifications: "日本内科学会認定内科医、日本循環器学会専門医",
      clinicalExperience: "15年以上の総合内科・循環器診療経験。救急外来3年、大学病院8年。",
      yearsExperience: 15,
      treatmentMethods: "ECG, antihypertensive therapy, lifestyle counseling, blood pressure monitoring",
      successRate: 92,
      hospitalAffiliation: "Tokyo Central Hospital",
      consultationFee: 5000,
      verified: true,
      licenseVerified: true,
      govDbVerified: true,
      hospitalConfirmed: true,
      languages: "日本語, English",
      awards: "2023年 東京都優秀医師賞",
      publications: "Hypertension management in elderly patients — JMA 2024",
      research: "高齢者高血圧の長期予後に関するコホート研究",
      schedule: "月・水・金 09:00-17:00\n火・木 13:00-20:00（オンライン）",
      onlineAvailable: true,
      offlineAvailable: true,
    },
    create: { userId: doctor.id },
  });

  const nurseHash = await bcrypt.hash("Nurse!2026", 10);
  const nurse = await prisma.user.upsert({
    where: { email: "nurse@medcare.local" },
    update: { photoUrl: avatar("Sakura Ito"), phone: "090-5555-0202", gender: "female" },
    create: {
      email: "nurse@medcare.local",
      name: "Sakura Ito",
      role: Role.NURSE,
      passwordHash: nurseHash,
      active: true,
      verified: true,
      phone: "090-5555-0202",
      gender: "female",
      photoUrl: avatar("Sakura Ito"),
      bio: "Clinical nurse specialist.",
      nurseProfile: {
        create: {
          licenseNumber: "RN-JP-445566",
          nationalRegNumber: "看護師免許 第789012号",
          university: "順天堂大学看護学部",
          graduationYear: 2012,
          boardCertifications: "日本看護協会認定看護師、専門看護師（緩和ケア）",
          specialty: "General Nursing",
          subspecialty: "Emergency & Home Care",
          clinicalExperience: "救急病棟6年、訪問看護4年。在宅医療チームリーダー経験あり。",
          yearsExperience: 12,
          treatmentMethods: "home visit chronic care, wound care, medication adherence counseling",
          successRate: 94,
          hospitalAffiliation: "Tokyo Central Hospital",
          languages: "日本語, English",
          awards: "2024年 優秀看護師表彰（東京都）",
          publications: "Home visit nursing for elderly hypertension — JNS 2023",
          research: "在宅高血圧患者のセルフケア支援プログラム評価",
          consultationFee: 3000,
          schedule: "日・火・木 08:00-16:00\n土 09:00-13:00（訪問）",
          certifications: "RN, BSN, 専門看護師（緩和ケア）",
          clinicalSpecialties: "Emergency, Home visit, Chronic care",
          shiftAvailability: "日勤・夜勤・オンコール対応可",
          homeVisitAvailable: true,
          onlineAvailable: true,
          offlineAvailable: true,
          verified: true,
        },
      },
    },
  });

  await prisma.nurseProfile.upsert({
    where: { userId: nurse.id },
    update: {
      licenseNumber: "RN-JP-445566",
      nationalRegNumber: "看護師免許 第789012号",
      university: "順天堂大学看護学部",
      graduationYear: 2012,
      boardCertifications: "日本看護協会認定看護師、専門看護師（緩和ケア）",
      specialty: "General Nursing",
      subspecialty: "Emergency & Home Care",
      clinicalExperience: "救急病棟6年、訪問看護4年。在宅医療チームリーダー経験あり。",
      yearsExperience: 12,
      treatmentMethods: "home visit chronic care, wound care, medication adherence counseling",
      successRate: 94,
      hospitalAffiliation: "Tokyo Central Hospital",
      languages: "日本語, English",
      awards: "2024年 優秀看護師表彰（東京都）",
      publications: "Home visit nursing for elderly hypertension — JNS 2023",
      research: "在宅高血圧患者のセルフケア支援プログラム評価",
      consultationFee: 3000,
      schedule: "日・火・木 08:00-16:00\n土 09:00-13:00（訪問）",
      certifications: "RN, BSN, 専門看護師（緩和ケア）",
      clinicalSpecialties: "Emergency, Home visit, Chronic care",
      shiftAvailability: "日勤・夜勤・オンコール対応可",
      homeVisitAvailable: true,
      onlineAvailable: true,
      offlineAvailable: true,
      verified: true,
    },
    create: { userId: nurse.id },
  });

  const hospitalHash = await bcrypt.hash("Hospital!2026", 10);
  const hospitalUser = await prisma.user.upsert({
    where: { email: "hospital@medcare.local" },
    update: { photoUrl: avatar("Tokyo Central"), phone: "03-5555-0303" },
    create: {
      email: "hospital@medcare.local",
      name: "Tokyo Central Hospital Admin",
      role: Role.HOSPITAL,
      passwordHash: hospitalHash,
      active: true,
      verified: true,
      phone: "03-5555-0303",
      photoUrl: avatar("Tokyo Central"),
      hospitalProfile: {
        create: {
          name: "Tokyo Central Hospital",
          departments: "循環器内科、救急科、総合内科、整形外科、小児科",
          equipment: "MRI、CT、血管造影装置、人工呼吸器、透析設備",
          emergencyAvailable: true,
          icuBeds: 24,
          totalBeds: 450,
          operatingRooms: 8,
          verified: true,
          operatingHours: "24時間365日",
          parking: true,
          acceptedInsurance: "国民健康保険、協会けんぽ、組合健保、主要民間保険",
          languages: "日本語, English, 中文",
          pharmacyOnSite: true,
          ambulance: true,
          accreditation: "日本医療機能評価機構 3rd grade",
          businessRegistration: "医療法人社団中央会 第TC-2010号",
          medicalInstitutionReg: "MI-TOKYO-TC-2010",
          businessRegVerified: true,
          medicalInstitutionVerified: true,
          treatmentMethods: "catheterization, MRI diagnostics, emergency trauma, dialysis",
          address: "1-1 Marunouchi, Chiyoda-ku, Tokyo",
          latitude: 35.6812,
          longitude: 139.7671,
          doctorsList: "Dr. Kenji Sato, Dr. Yuki Yamada, Dr. Hiroshi Nakamura",
          nursesList: "Sakura Ito, Mika Suzuki, Yui Tanaka",
        },
      },
    },
  });

  await prisma.hospitalProfile.upsert({
    where: { userId: hospitalUser.id },
    update: {
      name: "Tokyo Central Hospital",
      departments: "循環器内科、救急科、総合内科、整形外科、小児科",
      equipment: "MRI、CT、血管造影装置、人工呼吸器、透析設備",
      emergencyAvailable: true,
      icuBeds: 24,
      totalBeds: 450,
      operatingRooms: 8,
      verified: true,
      operatingHours: "24時間365日",
      parking: true,
      acceptedInsurance: "国民健康保険、協会けんぽ、組合健保、主要民間保険",
      languages: "日本語, English, 中文",
      pharmacyOnSite: true,
      ambulance: true,
      accreditation: "日本医療機能評価機構 3rd grade",
      businessRegistration: "医療法人社団中央会 第TC-2010号",
      medicalInstitutionReg: "MI-TOKYO-TC-2010",
      businessRegVerified: true,
      medicalInstitutionVerified: true,
      treatmentMethods: "catheterization, MRI diagnostics, emergency trauma, dialysis",
      address: "1-1 Marunouchi, Chiyoda-ku, Tokyo",
      latitude: 35.6812,
      longitude: 139.7671,
      doctorsList: "Dr. Kenji Sato, Dr. Yuki Yamada, Dr. Hiroshi Nakamura",
      nursesList: "Sakura Ito, Mika Suzuki, Yui Tanaka",
    },
    create: { userId: hospitalUser.id, name: "Tokyo Central Hospital" },
  });

  const companyHash = await bcrypt.hash("Company!2026", 10);
  const companyUser = await prisma.user.upsert({
    where: { email: "company@medcare.local" },
    update: { photoUrl: avatar("MedCorp HR"), phone: "03-5555-0404" },
    create: {
      email: "company@medcare.local",
      name: "MedCorp HR",
      role: Role.COMPANY,
      passwordHash: companyHash,
      active: true,
      verified: true,
      phone: "03-5555-0404",
      photoUrl: avatar("MedCorp HR"),
      companyProfile: {
        create: {
          name: "MedCorp Industries",
          employeeCount: 1200,
          verified: true,
          taxId: "1234567890123",
          taxIdVerified: true,
          businessRegistration: "CORP-REG-3012345678901",
          businessRegVerified: true,
          employeesJson: JSON.stringify([
            { id: "E001", name: "山田太郎", dept: "営業部", status: "active", email: "patient@medcare.local" },
            { id: "E002", name: "佐藤花子", dept: "開発部", status: "active" },
            { id: "E003", name: "鈴木一郎", dept: "人事部", status: "active" },
          ]),
          healthCheckSchedule: "2026年4月：全社定期健診\n2026年10月：特定健診・がん検診",
          medicalReports: "2025年度 健康診断結果サマリー：高血圧リスク 8%、メタボリスク 12%",
          healthCampaigns: "春のウォーキングキャンペーン（3-5月）\n禁煙サポートプログラム（通年）",
          vaccinationPrograms: "2026年度インフルエンザ予防接種（10-12月）\n新型コロナワクチン追加接種",
          insuranceSupport: "協会けんぽ加入、産業医契約、メンタルヘルスEAP提供",
        },
      },
    },
  });

  await prisma.companyProfile.upsert({
    where: { userId: companyUser.id },
    update: {
      name: "MedCorp Industries",
      employeeCount: 1200,
      verified: true,
      taxId: "1234567890123",
      taxIdVerified: true,
      businessRegistration: "CORP-REG-3012345678901",
      businessRegVerified: true,
      employeesJson: JSON.stringify([
        { id: "E001", name: "山田太郎", dept: "営業部", status: "active", email: "patient@medcare.local" },
        { id: "E002", name: "佐藤花子", dept: "開発部", status: "active" },
        { id: "E003", name: "鈴木一郎", dept: "人事部", status: "active" },
      ]),
      healthCheckSchedule: "2026年4月：全社定期健診\n2026年10月：特定健診・がん検診",
      medicalReports: "2025年度 健康診断結果サマリー：高血圧リスク 8%、メタボリスク 12%",
      healthCampaigns: "春のウォーキングキャンペーン（3-5月）\n禁煙サポートプログラム（通年）",
      vaccinationPrograms: "2026年度インフルエンザ予防接種（10-12月）\n新型コロナワクチン追加接種",
      insuranceSupport: "協会けんぽ加入、産業医契約、メンタルヘルスEAP提供",
    },
    create: { userId: companyUser.id, name: "MedCorp Industries" },
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
    update: {
      name: "Shinjuku Central Pharmacy",
      discounts: "シニア割引10%、定期処方5%オフ、MedCare会員送料無料",
    },
    create: {
      userId: pharmacyUser.id,
      name: "Shinjuku Central Pharmacy",
      deliveryAvailable: true,
      pickupAvailable: true,
      prescriptionSupport: true,
      discounts: "シニア割引10%、定期処方5%オフ、MedCare会員送料無料",
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
          interactions: "Potassium supplements, NSAIDs, lithium",
          warnings: "Consult physician if pregnant; may cause dizziness",
          alternatives: "Enalapril 10mg, Ramipril 5mg",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Ibuprofen 200mg",
          manufacturer: "PainAway Co",
          priceYen: 450,
          stock: 200,
          imageUrl: "https://images.unsplash.com/photo-1471864190281-a93a3070bfe6?w=400&q=80",
          ingredients: "Ibuprofen",
          interactions: "Aspirin, anticoagulants, ACE inhibitors",
          warnings: "Take with food; avoid if peptic ulcer",
          alternatives: "Naproxen 220mg, Acetaminophen 500mg",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Metformin 500mg",
          manufacturer: "DiabeCare",
          priceYen: 720,
          stock: 85,
          imageUrl: "https://images.unsplash.com/photo-1587854691652-5c651a388a2a?w=400&q=80",
          ingredients: "Metformin HCl",
          interactions: "Contrast dye, alcohol, cimetidine",
          warnings: "Risk of lactic acidosis in renal impairment",
          alternatives: "Sitagliptin 50mg, Glipizide 5mg",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Enalapril 10mg",
          manufacturer: "MedGen Pharma",
          priceYen: 890,
          stock: 60,
          imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
          ingredients: "Enalapril maleate",
          interactions: "Potassium, diuretics",
          warnings: "Monitor blood pressure",
          alternatives: "Lisinopril 10mg",
        },
        {
          pharmacyId: pharmacyProfile.id,
          name: "Acetaminophen 500mg",
          manufacturer: "PainAway Co",
          priceYen: 380,
          stock: 300,
          imageUrl: "https://images.unsplash.com/photo-1471864190281-a93a3070bfe6?w=400&q=80",
          ingredients: "Acetaminophen",
          interactions: "Warfarin (high doses), alcohol",
          warnings: "Do not exceed 4000mg/day",
          alternatives: "Ibuprofen 200mg",
        },
      ],
    });

  const companyProfileRow = await prisma.companyProfile.findUnique({
    where: { userId: companyUser.id },
  });
  if (companyProfileRow) {
    await prisma.corporateEmployee.deleteMany({ where: { companyId: companyProfileRow.id } });
    await prisma.corporateCampaign.deleteMany({ where: { companyId: companyProfileRow.id } });
    await prisma.medicalCertificate.deleteMany({ where: { companyId: companyProfileRow.id } });
    await prisma.sickLeaveRecord.deleteMany({ where: { companyId: companyProfileRow.id } });

    await prisma.corporateEmployee.createMany({
      data: [
        {
          companyId: companyProfileRow.id,
          name: "山田太郎",
          email: "patient@medcare.local",
          department: "営業部",
          status: "active",
          userId: patient.id,
          lastCheckupAt: new Date("2025-11-01"),
          vaccinatedAt: new Date("2025-10-15"),
        },
        {
          companyId: companyProfileRow.id,
          name: "佐藤花子",
          email: "sato.hanako@medcorp.example",
          department: "開発部",
          status: "active",
          lastCheckupAt: new Date("2025-09-20"),
        },
        {
          companyId: companyProfileRow.id,
          name: "鈴木一郎",
          email: "suzuki.ichiro@medcorp.example",
          department: "人事部",
          status: "active",
          vaccinatedAt: new Date("2025-10-20"),
        },
      ],
    });

    await prisma.corporateCampaign.createMany({
      data: [
        {
          companyId: companyProfileRow.id,
          name: "Influenza vaccination drive",
          type: "vaccination",
          status: "active",
          participation: 820,
          targetCount: 1200,
        },
        {
          companyId: companyProfileRow.id,
          name: "Q2 health checkups",
          type: "checkup",
          status: "planned",
          participation: 0,
          targetCount: 1200,
        },
      ],
    });

    await prisma.medicalCertificate.create({
      data: {
        companyId: companyProfileRow.id,
        employeeName: "山田太郎",
        type: "fitness",
        notes: "Fit for duty — annual physical",
        validUntil: new Date("2027-01-01"),
      },
    });

    await prisma.sickLeaveRecord.create({
      data: {
        companyId: companyProfileRow.id,
        employeeName: "佐藤花子",
        startDate: new Date("2026-07-01"),
        reason: "Seasonal flu",
        status: "closed",
        endDate: new Date("2026-07-05"),
      },
    });
  }

  await prisma.coupon.deleteMany({});
  await prisma.coupon.createMany({
    data: [
      {
        code: "WELCOME10",
        description: "10% off marketplace & billing",
        discountPercent: 10,
        discountYen: 0,
        active: true,
        maxUses: 1000,
      },
      {
        code: "SAVE500",
        description: "¥500 flat discount",
        discountPercent: 0,
        discountYen: 500,
        active: true,
      },
      {
        code: "AMBASSADOR20",
        description: "Ambassador 20% discount",
        discountPercent: 20,
        discountYen: 0,
        ambassadorOnly: true,
        active: true,
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
  await prisma.appointment.createMany({
    data: [
      {
        patientId: patient.id,
        doctorId: doctor.id,
        hospitalId: hospitalUser.id,
        type: "VIDEO",
        status: "BOOKED",
        scheduledAt: new Date(Date.now() + 86400000 * 3),
        notes: "Follow-up hypertension check",
      },
      {
        patientId: patient.id,
        doctorId: doctor.id,
        hospitalId: hospitalUser.id,
        type: "IN_PERSON",
        status: "BOOKED",
        scheduledAt: new Date(Date.now() + 86400000),
        notes: "Blood pressure review — waiting room",
      },
    ],
  });

  await prisma.subscription.deleteMany({ where: { userId: patient.id } });
  await prisma.subscription.create({
    data: {
      userId: patient.id,
      plan: "INDIVIDUAL",
      status: "ACTIVE",
      priceYen: 1000,
      paid: true,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000 * 365),
    },
  });

  await prisma.aiConsultation.deleteMany({ where: { userId: patient.id } });
  await prisma.aiConsultation.createMany({
    data: [
      {
        userId: patient.id,
        symptoms: "頭痛、めまい、血圧が高め",
        analysis: "軽度の高血圧関連症状の可能性。生活習慣の見直しを推奨。",
        riskLevel: "moderate",
        specialty: "Internal Medicine",
        recommendations: "塩分制限、十分な睡眠、血圧記録を1週間継続",
        emergency: false,
      },
      {
        userId: patient.id,
        symptoms: "花粉症のくしゃみと鼻水",
        analysis: "季節性アレルギー性鼻炎の可能性が高い。",
        riskLevel: "low",
        specialty: "Allergology",
        recommendations: "OTC抗ヒスタミン薬、マスク着用、窓の換気を控えめに",
        emergency: false,
      },
    ],
  });

  const [threadA, threadB] =
    patient.id < doctor.id ? [patient.id, doctor.id] : [doctor.id, patient.id];
  await prisma.chatThread.deleteMany({
    where: {
      OR: [
        { participantAId: threadA, participantBId: threadB },
      ],
    },
  });
  const chatThread = await prisma.chatThread.create({
    data: {
      participantAId: threadA,
      participantBId: threadB,
      agreedByA: true,
      agreedByB: true,
    },
  });
  await prisma.chatMessage.createMany({
    data: [
      {
        threadId: chatThread.id,
        senderId: patient.id,
        body: "Dr. Sato, 血圧の数値を共有します。朝の平均が145/92です。",
      },
      {
        threadId: chatThread.id,
        senderId: doctor.id,
        body: "ありがとうございます。来週の診察で詳しく確認しましょう。",
      },
    ],
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
      targetType: "doctor",
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

  await prisma.review.deleteMany({
    where: { authorId: patient.id, targetType: "hospital", targetId: hospitalUser.id },
  });
  await prisma.review.create({
    data: {
      authorId: patient.id,
      targetType: "hospital",
      targetId: hospitalUser.id,
      rating: 5,
      comment: "Excellent emergency department and clear insurance billing.",
      verified: true,
    },
  });

  await prisma.review.deleteMany({
    where: { authorId: patient.id, targetType: "nurse", targetId: nurse.id },
  });
  await prisma.review.create({
    data: {
      authorId: patient.id,
      targetType: "nurse",
      targetId: nurse.id,
      rating: 5,
      comment: "Sakura's home visit care was thorough and kind.",
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
      category: "medical_news",
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
      category: "research",
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
      category: "doctor",
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

  await prisma.knowledgeItem.deleteMany({});
  await prisma.knowledgeItem.createMany({
    data: [
      {
        type: "article",
        title: "Understanding hypertension",
        summary: "Causes, risks, and daily management of high blood pressure.",
        body: "Hypertension is a leading risk factor for stroke and heart disease. Measure BP at home, reduce salt, stay active, and follow prescribed ACE inhibitors when indicated.",
        tags: "cardiology,prevention",
        category: "medical_articles",
      },
      {
        type: "video",
        title: "How to take blood pressure at home",
        summary: "Short instructional video guide.",
        body: "Sit quietly for 5 minutes, cuff on bare upper arm, feet flat, record two readings one minute apart.",
        mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        tags: "video,self-care",
        category: "videos",
      },
      {
        type: "research",
        title: "SGLT2 inhibitors in heart failure — research brief",
        summary: "Evidence summary for clinicians.",
        body: "Recent trials show SGLT2 inhibitors reduce hospitalization in HFrEF regardless of diabetes status. Review renal function before initiation.",
        tags: "research,cardiology",
        category: "research",
      },
      {
        type: "faq",
        title: "How do I book a telemedicine visit?",
        summary: "FAQ for patients.",
        body: "Open Appointments, choose Video consultation, pick a doctor, and confirm. You will receive an email and push reminder.",
        tags: "faq,telemedicine",
        category: "faqs",
      },
      {
        type: "faq",
        title: "Is my chat encrypted?",
        summary: "Privacy FAQ.",
        body: "Yes. MedCare chat uses AES-256-GCM at rest. Transport uses TLS at the edge. Enable 2FA for account protection.",
        tags: "faq,security",
        category: "faqs",
      },
      {
        type: "preventive",
        title: "Annual checkup checklist",
        summary: "Preventive care guide.",
        body: "Blood pressure, BMI, fasting glucose/HbA1c as indicated, lipid panel, cancer screening per age, vaccinations (influenza, COVID boosters).",
        tags: "preventive,checkup",
        category: "preventive_care",
      },
      {
        type: "education",
        title: "Sleep hygiene basics",
        summary: "Health education module.",
        body: "Keep a consistent schedule, limit caffeine after noon, dark cool room, and aim for 7–9 hours. Track sleep in Analytics.",
        tags: "education,sleep",
        category: "health_education",
      },
      {
        type: "education",
        title: "Medication adherence tips",
        summary: "CME-style patient education.",
        body: "Use pill organizers, set phone reminders, sync refill dates with pharmacy delivery, and log adherence % weekly.",
        tags: "education,adherence",
        category: "health_education",
      },
    ],
  });

  await prisma.drugMonograph.deleteMany({});
  await prisma.drugMonograph.createMany({
    data: [
      {
        name: "Lisinopril",
        manufacturer: "MedGen Pharma",
        ingredients: "Lisinopril",
        uses: "Hypertension, heart failure, post-MI",
        dosage: "10–40 mg once daily",
        interactions: "NSAIDs, potassium supplements, lithium",
        warnings: "Fetal toxicity — avoid in pregnancy",
        sideEffects: "Cough, dizziness, hyperkalemia",
        category: "ACE inhibitor",
      },
      {
        name: "Metformin",
        manufacturer: "DiabeCare",
        ingredients: "Metformin hydrochloride",
        uses: "Type 2 diabetes",
        dosage: "500–1000 mg with meals",
        interactions: "Contrast dye, alcohol",
        warnings: "Lactic acidosis risk in renal impairment",
        sideEffects: "GI upset",
        category: "Biguanide",
      },
      {
        name: "Ibuprofen",
        manufacturer: "PainAway Co",
        ingredients: "Ibuprofen",
        uses: "Pain, inflammation, fever",
        dosage: "200–400 mg every 6–8 hours",
        interactions: "Aspirin, anticoagulants, ACE inhibitors",
        warnings: "GI bleeding risk; avoid in late pregnancy",
        sideEffects: "Stomach pain, edema",
        category: "NSAID",
      },
    ],
  });

  await prisma.healthMetric.deleteMany({ where: { userId: patient.id } });
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  await prisma.healthMetric.createMany({
    data: [
      { userId: patient.id, type: "weight", value: 72.5, unit: "kg", recordedAt: daysAgo(28) },
      { userId: patient.id, type: "weight", value: 72.1, unit: "kg", recordedAt: daysAgo(21) },
      { userId: patient.id, type: "weight", value: 71.8, unit: "kg", recordedAt: daysAgo(14) },
      { userId: patient.id, type: "weight", value: 71.4, unit: "kg", recordedAt: daysAgo(7) },
      { userId: patient.id, type: "bp_systolic", value: 138, unit: "mmHg", recordedAt: daysAgo(14) },
      { userId: patient.id, type: "bp_systolic", value: 132, unit: "mmHg", recordedAt: daysAgo(7) },
      { userId: patient.id, type: "bp_systolic", value: 128, unit: "mmHg", recordedAt: daysAgo(1) },
      { userId: patient.id, type: "bp_diastolic", value: 88, unit: "mmHg", recordedAt: daysAgo(14) },
      { userId: patient.id, type: "bp_diastolic", value: 84, unit: "mmHg", recordedAt: daysAgo(7) },
      { userId: patient.id, type: "bp_diastolic", value: 80, unit: "mmHg", recordedAt: daysAgo(1) },
      { userId: patient.id, type: "blood_sugar", value: 118, unit: "mg/dL", recordedAt: daysAgo(7) },
      { userId: patient.id, type: "blood_sugar", value: 110, unit: "mg/dL", recordedAt: daysAgo(1) },
      { userId: patient.id, type: "exercise_minutes", value: 30, unit: "min", recordedAt: daysAgo(3) },
      { userId: patient.id, type: "exercise_minutes", value: 45, unit: "min", recordedAt: daysAgo(1) },
      { userId: patient.id, type: "sleep_hours", value: 6.5, unit: "h", recordedAt: daysAgo(2) },
      { userId: patient.id, type: "sleep_hours", value: 7.2, unit: "h", recordedAt: daysAgo(1) },
      { userId: patient.id, type: "medication_adherence", value: 85, unit: "%", recordedAt: daysAgo(14) },
      { userId: patient.id, type: "medication_adherence", value: 92, unit: "%", recordedAt: daysAgo(7) },
      { userId: patient.id, type: "medication_adherence", value: 96, unit: "%", recordedAt: daysAgo(1) },
    ],
  });

  await prisma.notificationPreference.upsert({
    where: { userId: patient.id },
    update: {},
    create: { userId: patient.id },
  });

  await prisma.complaint.deleteMany({});
  await prisma.complaint.create({
    data: {
      userId: patient.id,
      name: patient.name,
      email: patient.email,
      subject: "Delayed prescription pickup notice",
      body: "Pharmacy status stayed on PREPARING longer than expected.",
      againstType: "pharmacy",
      status: "open",
    },
  });

  console.log("Knowledge, drugs, health metrics, and complaints seeded.");

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
