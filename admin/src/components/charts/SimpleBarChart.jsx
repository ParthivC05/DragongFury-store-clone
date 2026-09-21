/**
 * Reusable bar chart for Transaction Totals or Top Stores/Distributors.
 * Props: title, data, xKey, barKey, yLabel, valueFormatter
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCompactNumber } from '../../utils/format'

const DEFAULT_BAR_COLOR = '#3b82f6'

export default function SimpleBarChart({
  title = 'Transaction Totals',
  /** Optional short description shown below the title */
  description,
  data = [],
  xKey = 'label',
  barKey = 'value',
  yLabel = 'Amount (SC)',
  valueFormatter = (v) => `${Number(v).toFixed(2)} SC`,
  barColor = DEFAULT_BAR_COLOR,
  /** Optional: one color per bar (e.g. [green, red] for Recharge, Withdraw) */
  barColors,
  /** Optional: X-axis label (e.g. "Type", "Store", "Distributor") — overrides default from xKey */
  xAxisLabel,
  height = 280
}) {
  const formatY = (v) => formatCompactNumber(Number(v))
  const xLabel = xAxisLabel ?? (xKey === 'type' ? 'Type' : (xKey === 'label' ? 'Store' : xKey))

  return (
    <div className="dashboard-chart-wrap">
      {title && <h4>{title}</h4>}
      {description && <p className="dashboard-chart-description">{description}</p>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 20, left: 8, bottom: 32 }}>
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10 }}
            label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={formatY}
            label={{
              value: yLabel,
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle' },
              fontSize: 12
            }}
          />
          <Tooltip
            formatter={(v) => [valueFormatter(v)]}
            labelFormatter={(label) => String(label)}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey={barKey} fill={barColor} radius={[4, 4, 0, 0]} name={yLabel}>
            {barColors && Array.isArray(barColors) && data.length > 0
              ? data.map((_, index) => <Cell key={index} fill={barColors[index % barColors.length]} />)
              : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
