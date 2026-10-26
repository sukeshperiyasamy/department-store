"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#0f766e", "#6366f1", "#f59e0b", "#0284c7", "#dc2626", "#15803d"];

const AXIS = { stroke: "#64748b", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 13,
  color: "#1f2937",
};

export function SalesCharts({
  paymentSplit,
  cashierSplit,
}: {
  paymentSplit: { mode_of_payment: string; amount: number }[];
  cashierSplit: { cashier: string; bills: number; gross_sales: number }[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
      <div>
        <h3 className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Payment methods
        </h3>
        {paymentSplit.length === 0 ? (
          <div className="empty">No payments recorded for this date yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={paymentSplit} dataKey="amount" nameKey="mode_of_payment"
                   innerRadius={55} outerRadius={90} paddingAngle={2}>
                {paymentSplit.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div>
        <h3 className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Sales by cashier
        </h3>
        {cashierSplit.length === 0 ? (
          <div className="empty">No bills yet for this date.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cashierSplit} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="cashier" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={70}
                     tickFormatter={(v: number) => formatINR(v)} />
              <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="gross_sales" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={46} />
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
