import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import * as transactionsApi from '../../api/transactions';
import * as gamesApi from '../../api/games';
import { usePageContentReady } from '../../context/PageReadyContext';
import { formatSc } from '../../utils/currency';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { ArrowUpIcon, ArrowDownIcon, DollarIcon } from '../../assets/icons';
const PAGE_SIZES = [10, 20, 50];
const DEFAULT_LIMIT = 20;

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dateStr} ${timeStr}`;
}

function getTransactionDate(tx) {
  return tx?.date ?? tx?.createdAt ?? tx?.created_at ?? tx?.timestamp ?? null;
}

function typeLabel(type) {
  const map = {
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    spin_wheel: 'Spin Wheel',
    welcome_signup: 'Welcome Bonus',
    referral_friend_signup: 'Referral Bonus',
    promotion: 'Promotions',
    bonus_code: 'Deposit bonus',
    affiliate: 'Refer & Earn',
    vip_bonus: 'VIP Bonus',
    game_deposit: 'Game Deposit',
    game_withdraw: 'Game Withdraw'
  };
  return map[type] || type;
}

function TransactionTypeCell({ type }) {
  const label = typeLabel(type);
  const showArrowUp = ['deposit', 'game_withdraw'].includes(type);
  const showArrowDown = ['withdraw', 'game_deposit'].includes(type);
  const isBonus = [
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'bonus_code',
    'affiliate',
    'vip_bonus'
  ].includes(type);

  if (showArrowUp) {
    return (
      <span className="dash-tx-badge dash-tx-badge--in">
        <ArrowUpIcon className="shrink-0 w-4 h-4" />
        {label}
      </span>
    );
  }
  if (showArrowDown) {
    return (
      <span className="dash-tx-badge dash-tx-badge--out">
        <ArrowDownIcon className="shrink-0 w-4 h-4" />
        {label}
      </span>
    );
  }
  if (isBonus) {
    return (
      <span className="dash-tx-badge dash-tx-badge--bonus">
        <DollarIcon className="shrink-0 w-4 h-4" />
        {label}
      </span>
    );
  }
  return <span className="dash-tx-badge">{label}</span>;
}

/** Amount from wallet perspective: + green for deposit/game withdraw, + gold for bonus ($), - red for withdraw/deductions. Uses abs(amount) so sign is never duplicated. */
function WalletAmount({ type, amount }) {
  const walletGains = [
    'deposit',
    'game_withdraw',
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'bonus_code',
    'affiliate',
    'vip_bonus'
  ].includes(type);
  const isBonus = [
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'bonus_code',
    'affiliate',
    'vip_bonus'
  ].includes(type);
  const value = Math.abs(Number(amount));
  const sign = walletGains ? '+' : '-';
  let tone = 'out';
  if (walletGains) tone = isBonus ? 'bonus' : 'in';
  return (
    <span className={`dash-tx-amount dash-tx-amount--${tone}`}>
      {sign}{formatSc(value)}
    </span>
  );
}

export function AccountTransactions() {
  const { toast } = useToast();
  const [data, setData] = useState({ transactions: [], total: 0, page: 1, limit: DEFAULT_LIMIT, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    category: '',
    gameName: ''
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [registeredGames, setRegisteredGames] = useState([]);

  usePageContentReady(!loading);

  useEffect(() => {
    let cancelled = false;
    gamesApi
      .listGames()
      .then((list) => {
        if (cancelled) return;
        const games = list.games || list || [];
        const registered = games.filter(
          (g) => g.has_account && g.account_status === 'approved'
        );
        setRegisteredGames(registered);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const fetchTransactions = useCallback(
    async (pageNum, limitNum, filterOverrides = {}) => {
      setLoading(true);
      try {
        const params = {
          page: pageNum,
          limit: limitNum,
          ...filters,
          ...filterOverrides
        };
        if (!params.dateFrom) delete params.dateFrom;
        if (!params.dateTo) delete params.dateTo;
        if (!params.category) delete params.category;
        if (!params.gameName) delete params.gameName;
        const res = await transactionsApi.getTransactions(params);
        const total = res.total ?? 0;
        const totalPages = Math.max(1, res.total_pages ?? Math.ceil(total / (res.limit ?? limitNum)));
        setData({
          transactions: res.transactions || [],
          total,
          page: res.page ?? pageNum,
          limit: res.limit ?? limitNum,
          total_pages: totalPages
        });
      } catch (err) {
        toast.error(err.message || 'Failed to load transactions.');
        setData((prev) => ({ ...prev, transactions: [] }));
      } finally {
        setLoading(false);
      }
    },
    [filters, toast]
  );

  useEffect(() => {
    fetchTransactions(page, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when page/limit change, not when filters change
  }, [page, limit]);

  function handleApplyFilters() {
    setPage(1);
    fetchTransactions(1, limit, filters);
  }

  function handleClearFilters() {
    setFilters({ dateFrom: '', dateTo: '', category: '', gameName: '' });
    setPage(1);
    fetchTransactions(1, limit, { dateFrom: '', dateTo: '', category: '', gameName: '' });
  }

  function goToPage(nextPage) {
    const p = Math.max(1, Math.min(data.total_pages || 1, nextPage));
    setPage(p);
  }

  const { transactions, total, total_pages } = data;
  const hasFilters = filters.dateFrom || filters.dateTo || filters.category || filters.gameName;

  return (
    <div className="dash-page dash-tx-page w-full min-w-0">
      <header className="dash-deposit-header dash-animate-in">
        <motion.p
          className="dash-tx-page-tag"
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          🎮 Wallet Quest Log
        </motion.p>
        <h1 className="dash-deposit-title">Transactions</h1>
        <p className="dash-deposit-sub">
          Track deposits, withdrawals, bonuses, VIP rewards, and game moves — all in one animated ledger.
        </p>
      </header>

      {/* Filters */}
      <section className="dash-panel dash-tx-filters dash-animate-in dash-delay-1 min-w-0">
        <div className="dash-panel-head--icon">
          <span className="dash-panel-icon" aria-hidden>🔍</span>
          <h2 className="dash-panel-title">Filters</h2>
        </div>
        <p className="dash-panel-desc">Narrow your quest log by date, category, or game.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <div className="min-w-0">
            <label className="dash-field-label">From date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="dash-tx-date"
            />
          </div>
          <div className="min-w-0">
            <label className="dash-field-label">To date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="dash-tx-date"
            />
          </div>
          <div className="min-w-0">
            <label className="dash-field-label">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="dash-tx-select"
            >
              {transactionsApi.TRANSACTION_CATEGORIES.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="dash-field-label">Game</label>
            <select
              value={filters.gameName}
              onChange={(e) => setFilters((f) => ({ ...f, gameName: e.target.value }))}
              className="dash-tx-select"
            >
              <option value="">All games</option>
              {registeredGames.map((g) => (
                <option key={g.id} value={g.name}>
                  {getGameDisplayName(g.name)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="dash-btn-cta w-auto px-5 py-2.5 text-sm"
          >
            Apply filters
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="dash-btn-outline px-5 py-2.5 text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Table + Pagination */}
      <section className="dash-panel dash-animate-in dash-delay-2 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="dash-panel-title m-0">Transaction history</h2>
            <p className="dash-panel-desc m-0 mt-1">Live ledger of your wallet activity</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--dash-muted)]">Show</span>
            <select
              value={limit}
              onChange={(e) => {
                const newLimit = Number(e.target.value);
                setLimit(newLimit);
                setPage(1);
              }}
              className="dash-tx-limit-select"
              aria-label="Transactions per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-sm text-[var(--dash-muted)]">per page</span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center text-sm text-[var(--dash-muted)]">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="dash-empty-state dash-tx-empty">
            <span className="dash-tx-empty-icon" aria-hidden>📜</span>
            <p className="m-0">No transactions found.</p>
            <p className="text-sm text-[var(--dash-muted)] m-0">Try adjusting filters or make your first move.</p>
            <Link to="/deposit" className="dash-btn-cta w-auto px-5 py-2.5 text-sm no-underline">
              Go to Deposit
            </Link>
          </div>
        ) : (
          <>
            <div className="dash-data-table-wrap">
              <table className="dash-data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Game</th>
                    <th className="text-right">Amount (SC)</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <motion.tr
                      key={tx.id}
                      className="dash-tx-table-row"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.35 }}
                    >
                      <td className="whitespace-nowrap dash-td-muted">{formatDate(getTransactionDate(tx))}</td>
                      <td>
                        <TransactionTypeCell type={tx.type} />
                      </td>
                      <td>{tx.description || '—'}</td>
                      <td className="dash-td-muted">{tx.game_name ? getGameDisplayName(tx.game_name) : '—'}</td>
                      <td className="text-right">
                        <WalletAmount type={tx.type} amount={tx.amount} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(total > 0 || data.transactions.length > 0) && (
              <div className="dash-tx-pager">
                <p className="dash-tx-pager-info m-0">
                  Showing {total === 0 ? 0 : (data.page - 1) * data.limit + 1}–
                  {total === 0 ? 0 : Math.min(data.page * data.limit, total)} of {total}
                </p>
                <div className="dash-tx-pager-actions">
                  <button
                    type="button"
                    onClick={() => goToPage(1)}
                    disabled={data.page <= 1}
                    className="dash-tx-pager-btn"
                    aria-label="First page"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(data.page - 1)}
                    disabled={data.page <= 1}
                    className="dash-tx-pager-btn"
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span className="dash-tx-pager-page">
                    Page {data.page} of {total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(data.page + 1)}
                    disabled={data.page >= total_pages}
                    className="dash-tx-pager-btn"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(total_pages)}
                    disabled={data.page >= total_pages}
                    className="dash-tx-pager-btn"
                    aria-label="Last page"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
