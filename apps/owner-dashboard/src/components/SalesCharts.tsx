"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#0f9d8a", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];

export function SalesCharts({
  paymentSplit,
  cashierSplit,
}: {
  paymentSplit: { mode_of_payment: string; amount: number }[];
  cashierSplit: { cashier: string; bills: number; gross_sales: number }[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div>
        <h3 className="muted" style={{ fontSize: 13 }}>Payment methods (today)</h3>
        {paymentSplit.length === 0 ? (
          <p className="muted">No payments recorded yet today.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={paymentSplit}
                dataKey="amount"
                nameKey="mode_of_payment"
                innerRadius={55}
                outerRadius={90}
              >
                {paymentSplit.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatINR(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div>
        <h3 className="muted" style={{ fontSize: 13 }}>Sales by cashier (today)</h3>
        {cashierSplit.length === 0 ? (
          <p className="muted">No bills yet today.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cashierSplit}>
              <XAxis dataKey="cashier" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => formatINR(value)} />
              <Bar dataKey="gross_sales" fill="#0f9d8a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
