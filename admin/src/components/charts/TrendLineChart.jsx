/**
 * Reusable line chart for Recharge vs Withdraw (or any trend over date).
 * Props: title, data, xKey, lines[], yLabel, valueFormatter, showNetInTooltip
 */
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { formatDateForAxis } from '../../utils/dateRange'
import { formatCompactNumber } from '../../utils/format'

const DEFAULT_COLORS = ['#10b981', '#ef4444', '#3b82f6']

function MoneyFlowTooltip({ active, payload, label, valueFormatter, xKey }) {
  if (!active || !payload?.length || !label) return null
  const recharge = Number(payload.find((p) => p.dataKey === 'rechargeAmount')?.value ?? 0)
  const withdraw = Number(payload.find((p) => p.dataKey === 'withdrawAmount')?.value ?? 0)
  const net = recharge - withdraw
  const dateStr = xKey === 'date' && label ? formatDateForAxis(label) : label
  return (
    <div className="reports-chart-tooltip">
      <div className="reports-chart-tooltip-label">{dateStr}</div>
      <div>Recharge: {valueFormatter(recharge)}</div>
      <div>Withdraw: {valueFormatter(withdraw)}</div>
      <div className="reports-chart-tooltip-net">Net: {valueFormatter(net)}</div>
    </div>
  )
}

export default function TrendLineChart({
  title = 'Recharge vs Withdraw (Daily)',
  data = [],
  xKey = 'date',
  lines = [
    { key: 'rechargeAmount', label: 'Recharge', color: '#10b981' },
    { key: 'withdrawAmount', label: 'Withdraw', color: '#ef4444' }
  ],
  yLabel = 'Amount (SC)',
  valueFormatter = (v) => `${Number(v).toFixed(2)} SC`,
  height = 300,
  showNetInTooltip = false
}) {
  const formatTick = (v) => (xKey === 'date' && v ? formatDateForAxis(v) : v)
  const formatY = (v) => formatCompactNumber(Number(v))

  const tooltipContent = showNetInTooltip
    ? (props) => <MoneyFlowTooltip {...props} valueFormatter={valueFormatter} xKey={xKey} />
    : undefined

  return (
    <div className="dashboard-chart-wrap">
      {title && <h4>{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 36, right: 20, left: 8, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10 }}
            tickFormatter={formatTick}
            label={{ value: xKey === 'date' ? 'Date' : xKey, position: 'insideBottom', offset: -8, fontSize: 12 }}
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
            content={tooltipContent}
            formatter={tooltipContent ? undefined : (v, name) => [valueFormatter(v), name]}
            labelFormatter={tooltipContent ? undefined : (label) => (xKey === 'date' && label ? `Date: ${formatDateForAxis(label)}` : label)}
            contentStyle={tooltipContent ? undefined : { fontSize: 12 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          />
          {lines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={line.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
