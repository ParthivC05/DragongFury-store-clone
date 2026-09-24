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
import '../../components/transactions/df-transactions.css';

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
    game_withdraw: 'Game Withdraw',
    admin_add: 'Admin add',
    admin_remove: 'Admin remove'
  };
  return map[type] || type;
}

function toneForType(type) {
  const walletGains = [
    'deposit',
    'game_withdraw',
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'bonus_code',
    'affiliate',
    'vip_bonus',
    'admin_add'
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
  if (isBonus) return 'bonus';
  if (walletGains) return 'in';
  return 'out';
}

function TransactionTypeCell({ type }) {
  const label = typeLabel(type);
  const tone = toneForType(type);
  const showArrowUp = ['deposit', 'game_withdraw', 'admin_add'].includes(type);
  const showArrowDown = ['withdraw', 'game_deposit', 'admin_remove', 'admin_deduct'].includes(type);
  const isBonus = tone === 'bonus';

  return (
    <span className={`df-tx-type-pill df-tx-type-pill--${tone}`}>
      {showArrowUp ? <ArrowUpIcon className="shrink-0 w-3.5 h-3.5" /> : null}
      {showArrowDown ? <ArrowDownIcon className="shrink-0 w-3.5 h-3.5" /> : null}
      {isBonus ? <DollarIcon className="shrink-0 w-3.5 h-3.5" /> : null}
      {label}
    </span>
  );
}

function WalletAmount({ type, amount }) {
  const tone = toneForType(type);
  const walletGains = tone === 'in' || tone === 'bonus';
  const value = Math.abs(Number(amount));
  const sign = walletGains ? '+' : '-';
  return (
    <strong className={`df-tx-amount--${tone}`}>
      {sign}
      {formatSc(value)}
    </strong>
  );
}

function MarkForType({ type }) {
  const tone = toneForType(type);
  if (tone === 'bonus') return <div className="df-tx-row__mark df-tx-row__mark--bonus" aria-hidden>$</div>;
  if (tone === 'out') return <div className="df-tx-row__mark df-tx-row__mark--out" aria-hidden>↓</div>;
  return <div className="df-tx-row__mark" aria-hidden>↑</div>;
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
        const registered = games.filter((g) => g.has_account && g.account_status === 'approved');
        setRegisteredGames(registered);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

  function handleRefresh() {
    fetchTransactions(page, limit);
  }

  function goToPage(nextPage) {
    const p = Math.max(1, Math.min(data.total_pages || 1, nextPage));
    setPage(p);
  }

  const { transactions, total, total_pages } = data;
  const hasFilters = filters.dateFrom || filters.dateTo || filters.category || filters.gameName;

  return (
    <div className="dash-page dash-tx-page df-tx-page w-full min-w-0">
      <header className="df-tx-hero">
        <div className="df-tx-hero-copy">
          <p className="df-tx-kicker">Wallet activity</p>
          <h1 className="df-tx-title">Transaction history</h1>
          <p className="df-tx-sub">
            Track deposits, withdrawals, bonuses, VIP rewards, game moves, and payouts — filter by date,
            category, or game.
          </p>
        </div>
        <button type="button" className="df-tx-refresh" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section className="df-tx-card" aria-label="Filters">
        <div className="df-tx-card-head">
          <div>
            <h2 className="df-tx-card-title">Filters</h2>
            <p className="df-tx-card-desc">Narrow your ledger by date, category, or game.</p>
          </div>
        </div>
        <div className="df-tx-filters-grid">
          <label className="df-tx-field">
            <span className="df-tx-field-label">From date</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="df-tx-input"
            />
          </label>
          <label className="df-tx-field">
            <span className="df-tx-field-label">To date</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="df-tx-input"
            />
          </label>
          <label className="df-tx-field">
            <span className="df-tx-field-label">Category</span>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="df-tx-select"
            >
              {transactionsApi.TRANSACTION_CATEGORIES.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="df-tx-field">
            <span className="df-tx-field-label">Game</span>
            <select
              value={filters.gameName}
              onChange={(e) => setFilters((f) => ({ ...f, gameName: e.target.value }))}
              className="df-tx-select"
            >
              <option value="">All games</option>
              {registeredGames.map((g) => (
                <option key={g.id} value={g.name}>
                  {getGameDisplayName(g.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="df-tx-actions">
          <button type="button" onClick={handleApplyFilters} className="df-tx-btn-primary">
            Apply filters
          </button>
          {hasFilters ? (
            <button type="button" onClick={handleClearFilters} className="df-tx-btn-ghost">
              Clear
            </button>
          ) : null}
        </div>
      </section>

      <section className="df-tx-card" aria-label="Transaction history">
        <div className="df-tx-card-head">
          <div>
            <h2 className="df-tx-card-title">Ledger</h2>
            <p className="df-tx-card-desc">Date, type, description, game, and SC amount</p>
          </div>
          <div className="df-tx-limit">
            <span>Show</span>
            <select
              value={limit}
              onChange={(e) => {
                const newLimit = Number(e.target.value);
                setLimit(newLimit);
                setPage(1);
              }}
              className="df-tx-limit-select"
              aria-label="Transactions per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>per page</span>
          </div>
        </div>

        {loading ? (
          <div className="df-tx-loading">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="df-tx-empty">
            <p>No transactions found.</p>
            <small>Try adjusting filters or make your first move.</small>
            <Link to="/deposit" className="df-tx-btn-primary">
              Go to Deposit
            </Link>
          </div>
        ) : (
          <>
            <div className="df-tx-list df-tx-list--mobile">
              {transactions.map((tx, i) => (
                <motion.article
                  key={tx.id}
                  className="df-tx-row"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.28 }}
                >
                  <MarkForType type={tx.type} />
                  <div className="df-tx-row__details">
                    <strong>{typeLabel(tx.type)}</strong>
                    <span>{formatDate(getTransactionDate(tx))}</span>
                    <small>
                      {[tx.description, tx.game_name ? getGameDisplayName(tx.game_name) : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </small>
                  </div>
                  <div className="df-tx-row__amount">
                    <WalletAmount type={tx.type} amount={tx.amount} />
                    <span>SC</span>
                    <em className={`df-tx-type-pill df-tx-type-pill--${toneForType(tx.type)}`}>
                      {typeLabel(tx.type)}
                    </em>
                  </div>
                </motion.article>
              ))}
            </div>

            <div className="df-tx-table-wrap">
              <table className="df-tx-table">
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
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDate(getTransactionDate(tx))}</td>
                      <td>
                        <TransactionTypeCell type={tx.type} />
                      </td>
                      <td>{tx.description || '—'}</td>
                      <td>{tx.game_name ? getGameDisplayName(tx.game_name) : '—'}</td>
                      <td className="text-right">
                        <WalletAmount type={tx.type} amount={tx.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(total > 0 || data.transactions.length > 0) && (
              <div className="df-tx-pager">
                <p className="df-tx-pager-info">
                  Showing {total === 0 ? 0 : (data.page - 1) * data.limit + 1}–
                  {total === 0 ? 0 : Math.min(data.page * data.limit, total)} of {total}
                </p>
                <div className="df-tx-pager-actions">
                  <button
                    type="button"
                    onClick={() => goToPage(1)}
                    disabled={data.page <= 1}
                    className="df-tx-pager-btn"
                    aria-label="First page"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(data.page - 1)}
                    disabled={data.page <= 1}
                    className="df-tx-pager-btn"
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span className="df-tx-pager-page">
                    Page {data.page} of {total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(data.page + 1)}
                    disabled={data.page >= total_pages}
                    className="df-tx-pager-btn"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(total_pages)}
                    disabled={data.page >= total_pages}
                    className="df-tx-pager-btn"
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
