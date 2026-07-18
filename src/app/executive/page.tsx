"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function ExecutivePage() {
  const [data, setData] = useState<{
    executiveKpis: Record<string, number | Record<string, number | null> | null>;
    populationHealth: {
      vaccinationStatistics: { completed: number; upcoming: number; activeCampaigns: number };
      outbreakAlerts: number;
      emergencyEvents: { last7Days: number };
      pandemicMonitoring: { status: string };
    } | null;
    hospitalPerformance: Array<{ name: string; totalBeds: number; icuBeds: number; emergencyBeds: number }>;
    doctorPerformance: Array<{ name: string; appointments: number; completionRate: number; avgRating: number | null }>;
    patientSatisfaction: { npsProxy: number; clinicalReviews: { avgRating: number | null; count: number } };
    medicineTrends: Array<{ medicineName: string; prescriptions: number; revenueYen: number }>;
    financialReports: { revenueYen: number; openReceivablesYen: number; paidInvoices: number; openInvoices: number };
    demandPrediction: Array<{ resourceType: string; region: string; predicted: number; day: string }>;
    resourceAllocation: Array<{ resourceType: string; region: string; predictedDemand: number; suggestedStaffing: number }>;
    predictiveAnalytics: { noShowRiskIndex: number; notes: string };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/executive")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      });
  }, []);

  const k = data?.executiveKpis;

  return (
    <PageShell
      eyebrow="AI Analytics"
      title="Executive dashboards"
      description="Population health · hospital & doctor performance · patient satisfaction · medicine trends · financial reports · demand prediction · resource allocation · predictive analytics."
    >
      {error && <p className="error-text">{error}</p>}
      <p className="muted">
        Also see <Link href="/analytics">Operations analytics</Link> · <Link href="/public-health">Public health</Link> ·{" "}
        <Link href="/ai-lab">AI Lab</Link>
      </p>

      {data && k && (
        <>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            {[
              ["Users", k.users],
              ["Doctors", k.doctors],
              ["Hospitals", k.hospitals],
              ["Appointments", k.appointments],
              ["Completion %", k.completionRate],
              ["Revenue ¥", k.revenueYen],
              ["NPS proxy", k.satisfactionNpsProxy],
              ["EMS 7d", k.emergencies7d],
            ].map((row) => {
              const label = String(row[0]);
              const value = row[1];
              const display =
                typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "—");
              return (
                <div key={label} className="panel">
                  <p className="badge">{label}</p>
                  <p style={{ fontSize: "1.6rem", margin: 0 }}>{display}</p>
                </div>
              );
            })}
          </div>

          <h3>Population health</h3>
          {data.populationHealth ? (
            <div className="panel" style={{ marginBottom: "1rem" }}>
              <p>
                Vax completed {data.populationHealth.vaccinationStatistics.completed} · upcoming{" "}
                {data.populationHealth.vaccinationStatistics.upcoming} · campaigns{" "}
                {data.populationHealth.vaccinationStatistics.activeCampaigns}
              </p>
              <p className="muted">
                Outbreaks {data.populationHealth.outbreakAlerts} · EMS 7d {data.populationHealth.emergencyEvents.last7Days} ·{" "}
                {data.populationHealth.pandemicMonitoring.status}
              </p>
            </div>
          ) : (
            <p className="muted">Population health unavailable</p>
          )}

          <h3>Hospital performance</h3>
          {data.hospitalPerformance.map((h) => (
            <p key={h.name}>
              {h.name}: beds {h.totalBeds} · ICU {h.icuBeds} · ER {h.emergencyBeds}
            </p>
          ))}

          <h3>Doctor performance</h3>
          {data.doctorPerformance.map((d) => (
            <p key={d.name}>
              {d.name}: {d.appointments} appts · {d.completionRate}% complete · rating{" "}
              {d.avgRating != null ? d.avgRating.toFixed(1) : "—"}
            </p>
          ))}

          <h3>Patient satisfaction</h3>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <p>NPS proxy {data.patientSatisfaction.npsProxy}</p>
            <p className="muted">
              Clinical avg {data.patientSatisfaction.clinicalReviews.avgRating?.toFixed(1) ?? "—"} (
              {data.patientSatisfaction.clinicalReviews.count} reviews)
            </p>
          </div>

          <h3>Medicine trends</h3>
          {data.medicineTrends.slice(0, 8).map((m) => (
            <p key={m.medicineName}>
              {m.medicineName}: {m.prescriptions} Rx · ¥{m.revenueYen.toLocaleString()}
            </p>
          ))}

          <h3>Financial reports</h3>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <p>Paid revenue ¥{data.financialReports.revenueYen.toLocaleString()} ({data.financialReports.paidInvoices} invoices)</p>
            <p className="muted">
              Open receivables ¥{data.financialReports.openReceivablesYen.toLocaleString()} (
              {data.financialReports.openInvoices})
            </p>
          </div>

          <h3>Demand prediction</h3>
          {data.demandPrediction.slice(0, 10).map((f, i) => (
            <p key={`${f.resourceType}-${i}`} className="muted">
              {String(f.day).slice(0, 10)} · {f.resourceType} @ {f.region}: predicted {f.predicted}
            </p>
          ))}

          <h3>Resource allocation</h3>
          {data.resourceAllocation.slice(0, 10).map((r, i) => (
            <p key={`${r.resourceType}-a-${i}`}>
              {r.resourceType} ({r.region}): demand {r.predictedDemand} → staff/slots {r.suggestedStaffing}
            </p>
          ))}

          <h3>Predictive analytics</h3>
          <div className="panel">
            <p>No-show risk index: {data.predictiveAnalytics.noShowRiskIndex}</p>
            <p className="muted">{data.predictiveAnalytics.notes}</p>
          </div>
        </>
      )}
    </PageShell>
  );
}
