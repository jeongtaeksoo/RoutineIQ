"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ConsistencyBarChart({
  data,
}: {
  data: Array<{ day: string; blocks: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.35)" />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          contentStyle={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
        />
        <Bar dataKey="blocks" fill="rgba(168,132,98,0.75)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
