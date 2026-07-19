
// app/care/page.tsx
export default function CarePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Care & Sleep Tips</h1>
      
      <section className="bg-white rounded-2xl p-6 border shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Rotate Your Mattress</h2>
        <p className="text-slate-600 mb-2">Most mattresses benefit from rotation every 3–6 months to promote even wear and maintain comfort.</p>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Rotate 180° (head to foot) every 3 months if no designated head/foot.</li>
          <li>Flip if the mattress is flippable (many modern ones are not).</li>
          <li>Keep the foundation or base level and supportive.</li>
        </ul>
      </section>

      <section className="bg-white rounded-2xl p-6 border shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Why a Waterproof Protector Matters</h2>
        <p className="text-slate-600">
          The 90-Night Comfort Guarantee requires the mattress to be in like-new, sanitary condition. 
          A good waterproof protector is the easiest way to protect against stains, spills, and allergens — 
          and helps keep your exchange eligibility intact. We strongly recommend one.
        </p>
      </section>

      <section className="bg-white rounded-2xl p-6 border shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Better Sleep Habits</h2>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Keep a consistent sleep schedule, even on weekends.</li>
          <li>Make the bedroom cool, dark, and quiet.</li>
          <li>Limit screens 30–60 minutes before bed.</li>
          <li>Give a new mattress 30+ nights before deciding on an exchange.</li>
        </ul>
      </section>
    </div>
  );
}
