
// app/claims/page.tsx
"use client";

import Link from "next/link";

const DEMO_CLAIMS = [
  {
    id: "c-001",
    transId: "1011099325A",
    model: "SEALY PILLOW TOP XXXX",
    status: "under_review",
    days: 65,
    type: "Comfort Exchange",
    created: "2026-07-18",
  },
];

export default function ClaimsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Claims</h1>
      <p className="text-slate-600">Track the status of your comfort guarantee, warranty, or service requests.</p>

      {DEMO_CLAIMS.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border">
          <p className="text-slate-500 mb-4">No claims yet.</p>
          <Link href="/claim" className="text-[#0B1D36] font-medium underline">Start a new request</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {DEMO_CLAIMS.map(c => (
            <div key={c.id} className="bg-white rounded-2xl p-5 border shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{c.model}</p>
                  <p className="text-sm text-slate-500">SO: {c.transId} · Day {c.days}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  {c.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm mt-2 text-slate-600">{c.type} · Submitted {c.created}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
