import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { leaderboardApiV1LeaderboardGet } from '../contracts/rest';
import { Search, Trophy, Medal, Award, Flame, Filter } from 'lucide-react';

export function Leaderboard() {
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [onlyWithMatches, setOnlyWithMatches] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', search, rankFilter, onlyWithMatches],
    queryFn: () =>
      leaderboardApiV1LeaderboardGet({
        query: {
          search: search.trim() || undefined,
          rank_filter: rankFilter || undefined,
          only_with_matches: onlyWithMatches,
        },
        throwOnError: true,
      }),
  });

  const currentStats = data?.current_player_stats;
  const items = data?.items || [];

  // Group top 3 and others
  const topThree = items.slice(0, 3);
  const rest = items.slice(3);

  // Helper for ranking colors
  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-amber-400" />;
      case 2:
        return <Medal className="h-5 w-5 text-slate-300" />;
      case 3:
        return <Medal className="h-5 w-5 text-amber-700" />;
      default:
        return <span className="font-mono text-xs text-slate-500 font-bold">#{rank}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 md:gap-8 font-sans text-slate-100 max-w-6xl mx-auto w-full pb-12">
      {/* Title & Description */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
            Global Leaderboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare Elo ratings, win rates, and ranking performance against top players.
          </p>
        </div>
      </section>

      {/* Current Player Personal Stats Card */}
      {currentStats && (
        <section className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slideDown shadow-lg shadow-purple-950/10">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400">
                Your Current Standing
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-0.5">
                {currentStats.rank ? `Ranked #${currentStats.rank}` : 'Unranked'}
              </h3>
            </div>
          </div>

          <div className="flex gap-6 sm:gap-10 text-center sm:text-left">
            <div>
              <span className="text-[10px] text-slate-400 font-medium">Rating</span>
              <p className="text-lg font-bold text-slate-200 mt-0.5">{currentStats.rating}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-medium">Peak Rating</span>
              <p className="text-lg font-bold text-slate-200 mt-0.5">
                {currentStats.highest_rating}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-medium">Matches</span>
              <p className="text-lg font-bold text-slate-200 mt-0.5">
                {currentStats.completed_matches}
              </p>
            </div>
            {currentStats.diff_to_previous_player !== null &&
              currentStats.diff_to_previous_player > 0 && (
                <div>
                  <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-1">
                    <Flame className="h-3 w-3" /> Next Tier
                  </span>
                  <p className="text-lg font-bold text-purple-300 mt-0.5">
                    +{currentStats.diff_to_previous_player} pts
                  </p>
                </div>
              )}
          </div>
        </section>
      )}

      {/* Filter and Search controls */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search players by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-xl text-sm outline-none transition-all placeholder-slate-600"
          />
        </div>

        <div className="flex w-full md:w-auto gap-4 items-center justify-end">
          {/* Badge Rank Filter */}
          <div className="relative">
            <select
              value={rankFilter}
              onChange={(e) => setRankFilter(e.target.value)}
              className="h-11 px-4 pr-8 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-xl text-sm outline-none appearance-none transition-all text-slate-300 cursor-pointer"
            >
              <option value="">All Badges</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
              <option value="blue">Blue</option>
              <option value="default">Default</option>
            </select>
            <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Toggle with matches */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none py-2 text-xs font-semibold text-slate-400">
            <input
              type="checkbox"
              checked={onlyWithMatches}
              onChange={(e) => setOnlyWithMatches(e.target.checked)}
              className="rounded border-slate-800 bg-slate-950 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-950 h-4 w-4"
            />
            <span>Active Players Only</span>
          </label>
        </div>
      </section>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-12 text-center text-slate-500 text-sm">
          No players match the filter criteria.
        </div>
      ) : (
        <div className="space-y-8 animate-fadeIn">
          {/* Top 3 Podium Visual Layout */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-6 max-w-4xl mx-auto w-full">
              {/* 2nd Place */}
              {topThree[1] && (
                <Link
                  to={`/players/${topThree[1].account_id}`}
                  className="bg-slate-900/30 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-6 flex flex-col items-center text-center relative order-2 md:order-1 h-[240px] justify-between transition-all hover:scale-[1.02]"
                >
                  <div className="absolute top-4 left-4 bg-slate-800 text-slate-350 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-700">
                    2ND
                  </div>
                  <div
                    className="h-16 w-16 min-w-0 rounded-full flex items-center justify-center overflow-hidden px-1 text-center break-all whitespace-pre-wrap leading-tight text-white font-black text-2xl border-2 border-slate-400 shadow-md"
                    style={{ backgroundColor: topThree[1].avatar_background_color || '#4f46e5' }}
                  >
                    {topThree[1].avatar_text || topThree[1].display_name.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-200 mt-2 truncate max-w-[150px]">
                      {topThree[1].display_name}
                    </h4>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/40 border border-slate-800 px-1.5 py-0.5 rounded">
                      {topThree[1].rank_badge_theme}
                    </span>
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-100">{topThree[1].rating}</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Win Rate: {(topThree[1].win_rate * 100).toFixed(0)}%
                    </p>
                  </div>
                </Link>
              )}

              {/* 1st Place */}
              {topThree[0] && (
                <Link
                  to={`/players/${topThree[0].account_id}`}
                  className="bg-purple-900/10 border-2 border-purple-500/30 hover:border-purple-500/50 rounded-2xl p-6 flex flex-col items-center text-center relative order-1 md:order-2 h-[270px] justify-between shadow-xl shadow-purple-950/10 transition-all hover:scale-[1.02]"
                >
                  <div className="absolute top-4 left-4 bg-amber-500/10 text-amber-400 font-black px-2.5 py-0.5 rounded text-[10px] border border-amber-500/20 flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> CHAMP
                  </div>
                  <div
                    className="h-20 w-20 min-w-0 rounded-full flex items-center justify-center overflow-hidden px-1 text-center break-all whitespace-pre-wrap leading-tight text-white font-black text-2xl border-2 border-amber-400 shadow-lg shadow-purple-500/20"
                    style={{ backgroundColor: topThree[0].avatar_background_color || '#4f46e5' }}
                  >
                    {topThree[0].avatar_text || topThree[0].display_name.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-black text-base text-slate-100 mt-2 truncate max-w-[170px]">
                      {topThree[0].display_name}
                    </h4>
                    <span className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider bg-purple-950/50 border border-purple-800/40 px-1.5 py-0.5 rounded">
                      {topThree[0].rank_badge_theme}
                    </span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-amber-400">{topThree[0].rating}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Win Rate: {(topThree[0].win_rate * 100).toFixed(0)}%
                    </p>
                  </div>
                </Link>
              )}

              {/* 3rd Place */}
              {topThree[2] && (
                <Link
                  to={`/players/${topThree[2].account_id}`}
                  className="bg-slate-900/30 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-6 flex flex-col items-center text-center relative order-3 md:order-3 h-[220px] justify-between transition-all hover:scale-[1.02]"
                >
                  <div className="absolute top-4 left-4 bg-slate-800 text-amber-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-700">
                    3RD
                  </div>
                  <div
                    className="h-14 w-14 min-w-0 rounded-full flex items-center justify-center overflow-hidden px-1 text-center break-all whitespace-pre-wrap leading-tight text-white font-black text-xl border-2 border-amber-700 shadow-sm"
                    style={{ backgroundColor: topThree[2].avatar_background_color || '#4f46e5' }}
                  >
                    {topThree[2].avatar_text || topThree[2].display_name.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-200 mt-2 truncate max-w-[150px]">
                      {topThree[2].display_name}
                    </h4>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/40 border border-slate-800 px-1.5 py-0.5 rounded">
                      {topThree[2].rank_badge_theme}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-black text-slate-250">{topThree[2].rating}</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Win Rate: {(topThree[2].win_rate * 100).toFixed(0)}%
                    </p>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Leaderboard Table (Ranks 4+) */}
          {rest.length > 0 && (
            <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/20">
                      <th className="py-4 px-6 text-center w-16">Rank</th>
                      <th className="py-4 px-6">Player</th>
                      <th className="py-4 px-6 text-center">Badge</th>
                      <th className="py-4 px-6 text-right">Rating</th>
                      <th className="py-4 px-6 text-right">Highest Rating</th>
                      <th className="py-4 px-6 text-right">Matches</th>
                      <th className="py-4 px-6 text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-xs">
                    {rest.map((p) => (
                      <tr key={p.account_id} className="hover:bg-slate-900/10 transition-colors">
                        <td className="py-4 px-6 text-center">{getRankBadge(p.rank)}</td>
                        <td className="py-4 px-6">
                          <Link
                            to={`/players/${p.account_id}`}
                            className="flex items-center gap-3 group"
                          >
                            <div
                              className="h-8 w-8 min-w-0 rounded-full flex items-center justify-center overflow-hidden px-0.5 text-center break-all whitespace-pre-wrap leading-tight text-white font-bold text-xs shrink-0 shadow-sm"
                              style={{ backgroundColor: p.avatar_background_color || '#4f46e5' }}
                            >
                              {p.avatar_text || p.display_name.slice(0, 2)}
                            </div>
                            <span className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors truncate max-w-[150px]">
                              {p.display_name}
                            </span>
                          </Link>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="inline-flex px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-slate-900 text-slate-450 border border-slate-800/80">
                            {p.rank_badge_theme}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right font-bold text-slate-200">
                          {p.rating}
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-slate-400">
                          {p.highest_rating}
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-slate-400">
                          {p.completed_matches}
                        </td>
                        <td className="py-4 px-6 text-right font-bold text-emerald-400">
                          {(p.win_rate * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default Leaderboard;
