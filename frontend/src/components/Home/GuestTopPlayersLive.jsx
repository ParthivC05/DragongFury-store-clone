import { useEffect, useMemo, useState } from 'react';
import { LandingWinnerToasts } from '../LandingWinnerToasts';
import {
  cloneGuestWinnerRows,
  getWinnerRowKey,
  parseWinnerPrize,
  tickGuestWinnerRows,
} from '../../utils/guestWinnersLeaderboard';

function WinnerRankCell({ rank }) {
  if (rank === 1) return <td>🥇</td>;
  if (rank === 2) return <td>🥈</td>;
  if (rank === 3) return <td>🥉</td>;
  return <td>{rank}</td>;
}

/**
 * Inspo "TOP PLAYERS · LIVE" winners table — pairs with the spin card in #spin.
 */
export function GuestTopPlayersLive() {
  const [rows, setRows] = useState(() => cloneGuestWinnerRows('today'));
  const [flashKeys, setFlashKeys] = useState(() => new Set());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRows((current) => {
        const updated = tickGuestWinnerRows(current, 'today');
        const changedKeys = new Set();

        updated.forEach((row) => {
          const key = getWinnerRowKey(row);
          const previous = current.find((entry) => getWinnerRowKey(entry) === key);
          if (!previous || previous.prize !== row.prize) {
            changedKeys.add(key);
          }
        });

        setFlashKeys(changedKeys);
        return updated;
      });
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!flashKeys.size) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFlashKeys(new Set());
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [flashKeys]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => parseWinnerPrize(b.prize) - parseWinnerPrize(a.prize)),
    [rows]
  );

  return (
    <div className="dash-top-players-card">
      <LandingWinnerToasts rows={sortedRows} />

      <p className="dash-top-players-kick">
        <span className="dash-top-players-live-dot" aria-hidden />
        TOP PLAYERS · LIVE
      </p>
      <h2 className="dash-top-players-title">Winners — updated every hour</h2>

      <div className="dash-top-players-table-wrap">
        <table className="dash-top-players-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">PLAYER</th>
              <th scope="col" className="dash-top-players-col-location" />
              <th scope="col">GAME</th>
              <th scope="col">PRIZE</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((entry, index) => {
              const rank = index + 1;
              const rowKey = getWinnerRowKey(entry);
              const isFlashing = flashKeys.has(rowKey);

              return (
                <tr
                  key={entry._id ?? rowKey}
                  className={isFlashing ? 'is-live-update' : undefined}
                >
                  <WinnerRankCell rank={rank} />
                  <td>
                    <span className="dash-top-players-player">
                      {entry.avatar ? <span aria-hidden>{entry.avatar} </span> : null}
                      {entry.player}
                    </span>
                  </td>
                  <td className="dash-top-players-col-location">{entry.location}</td>
                  <td>{entry.game}</td>
                  <td className="dash-top-players-prize">{entry.prize}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
