
// app/page.tsx
import Link from "next/link";
import { Logo } from "../components/Logo";

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-12">
        <div className="flex justify-center mb-6">
          <Logo size={80} showText={false} />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#0B1D36] mb-4">
          Better sleep starts here
        </h1>
        <p className="text-lg text-slate-600 max-w-xl mx-auto mb-8">
          RAP Sleep Lab helps you with your 90-Night Comfort Guarantee exchange, 
          OEM warranty questions, and everyday mattress care — all in one calm, simple place.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/claim" 
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-[#0B1D36] text-white font-medium hover:bg-[#162a4a] transition"
          >
            Start a Claim or Request
          </Link>
          <Link 
            href="/care" 
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border border-slate-300 text-[#0B1D36] font-medium hover:bg-white transition"
          >
            Care & Sleep Tips
          </Link>
        </div>
      </section>

      {/* Demo Prefill helper */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-semibold mb-2">Demo Mode</h2>
        <p className="text-sm text-slate-600 mb-4">
          Try the prefill experience with sample data from the Excel format:
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/claim?trans_id=1011099325A" className="text-sm px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200">
            Prefill Andrew Turnbull (eligible)
          </Link>
          <Link href="/claim?trans_id=1011099456B" className="text-sm px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200">
            Prefill Jane Doe
          </Link>
        </div>
      </section>

      {/* Quick links */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold mb-2">Comfort Exchange</h3>
          <p className="text-sm text-slate-600">Day 31–90 · One-time · $99 restocking</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold mb-2">OEM Warranty</h3>
          <p className="text-sm text-slate-600">Defects, failures, or manufacturer issues</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold mb-2">Track Your Request</h3>
          <p className="text-sm text-slate-600">See status, photos, and next steps</p>
        </div>
      </section>
    </div>
  );
}
