
// app/admin/page.tsx
"use client";

export default function AdminPage() {
  const claims = [
    { id: "c-001", customer: "Andrew Turnbull", model: "Sealy Pillow Top", status: "under_review", type: "Comfort Exchange", days: 65 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Admin / Service Board</h1>
        <span className="text-xs bg-slate-200 px-2 py-1 rounded">Demo Mode</span>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Model</th>
              <th className="p-3">Type</th>
              <th className="p-3">Day</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.customer}</td>
                <td className="p-3">{c.model}</td>
                <td className="p-3">{c.type}</td>
                <td className="p-3">{c.days}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">{c.status}</span>
                </td>
                <td className="p-3">
                  <button className="text-blue-600 text-xs mr-2">View</button>
                  <button className="text-green-600 text-xs">Issue RA</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500">In production this board is filtered by role (admin sees all, dealer sees their store). Photos, full transcript, and structured data appear in the detail view. Status changes and notes are available.</p>
    </div>
  );
}
