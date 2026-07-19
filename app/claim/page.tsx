
// app/claim/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { MOCK_GUARANTEES } from "../../lib/mock-data";
import { calculateDaysSince, getEligibilityStatus, RESTOCKING_FEE, FAST_INSPECTION_FEE, FRIENDLY_REMINDERS } from "../../lib/eligibility";
import { Logo } from "../../components/Logo";
import Link from "next/link";

export default function ClaimPage() {
  const searchParams = useSearchParams();
  const transId = searchParams.get("trans_id");
  
  const [guarantee, setGuarantee] = useState(MOCK_GUARANTEES.find(g => g.transId === transId) || null);
  const [step, setStep] = useState<"welcome" | "issue" | "photos" | "summary" | "done">("welcome");
  const [issue, setIssue] = useState("");
  const [photos, setPhotos] = useState<any[]>([]);
  const [fastInspection, setFastInspection] = useState(false);
  const [messages, setMessages] = useState<{role: string; content: string}[]>([]);

  useEffect(() => {
    if (guarantee) {
      const elig = getEligibilityStatus(guarantee);
      setMessages([
        { role: "assistant", content: `Welcome back. I found your ${guarantee.manufacturer} ${guarantee.modelNum} (${guarantee.prodDesc}), purchased on ${guarantee.purchDate}.` },
        { role: "assistant", content: elig.message },
      ]);
      if (elig.canProceed) {
        setStep("issue");
      }
    } else {
      setMessages([{ role: "assistant", content: "Welcome to RAP Sleep Lab. To get started, please provide your Sales Order Number, or use a dashboard link that pre-fills your information." }]);
    }
  }, [guarantee]);

  const handleSubmitIssue = () => {
    setMessages(prev => [...prev, { role: "user", content: issue }, { role: "assistant", content: "Thank you. Now let's collect a few photos. Clear law tag and model tag photos are required for the fastest processing. Or you can choose the $29 Fast In-Person Inspection." }]);
    setStep("photos");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h1 className="text-2xl font-semibold mb-4">Start Your Request</h1>
        
        {/* Chat-like messages */}
        <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`p-3 rounded-xl ${m.role === "assistant" ? "bg-slate-100" : "bg-[#0B1D36] text-white ml-8"}`}>
              {m.content}
            </div>
          ))}
        </div>

        {step === "issue" && (
          <div className="space-y-4">
            <textarea
              className="w-full border rounded-xl p-3 h-28"
              placeholder="Describe what's not feeling right about the mattress..."
              value={issue}
              onChange={e => setIssue(e.target.value)}
            />
            <button
              onClick={handleSubmitIssue}
              className="w-full bg-[#0B1D36] text-white py-3 rounded-xl"
            >
              Continue
            </button>
          </div>
        )}

        {step === "photos" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">In a full build this would open the camera and guided PhotoUploader. For this demo, use the buttons below.</p>
            <button
              onClick={() => { setFastInspection(false); setStep("summary"); }}
              className="w-full bg-[#0B1D36] text-white py-3 rounded-xl"
            >
              Simulate uploading required photos (fastest path)
            </button>
            <button
              onClick={() => { setFastInspection(true); setStep("summary"); }}
              className="w-full border py-3 rounded-xl"
            >
              Choose $29 Fast In-Person Inspection
            </button>
          </div>
        )}

        {step === "summary" && guarantee && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 text-sm">
              <p><strong>Sales Order:</strong> {guarantee.transId}</p>
              <p><strong>Model:</strong> {guarantee.manufacturer} {guarantee.modelNum}</p>
              <p><strong>Issue:</strong> {issue}</p>
              <p><strong>Path:</strong> {fastInspection ? `$29 Fast Inspection` : "Photos uploaded"}</p>
              <p className="mt-2 text-amber-800">Restocking fee: ${RESTOCKING_FEE}. Both partners should be present for selection. Full terms apply.</p>
            </div>
            <button
              onClick={() => setStep("done")}
              className="w-full bg-green-700 text-white py-3 rounded-xl"
            >
              Submit Claim Request
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-4">
            <p className="text-xl font-semibold text-green-700">Request Submitted</p>
            <p>Your claim has been received. Track it in My Claims. Our team will review shortly.</p>
            <Link href="/claims" className="inline-block bg-[#0B1D36] text-white px-6 py-3 rounded-xl">
              View My Claims
            </Link>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        {FRIENDLY_REMINDERS.map((r, i) => <p key={i}>• {r}</p>)}
        <p className="mt-2">Support: 1-800-RAP-SLEEP · support@rapsleeplab.com</p>
      </div>
    </div>
  );
}
