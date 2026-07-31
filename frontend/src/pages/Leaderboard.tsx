import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Search, Trophy, Medal, Award, Flame, Filter } from 'lucide-react';
import { leaderboardApiV1LeaderboardGet } from '../contracts/rest';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../i18n/useFormatters';
import { ProfileAvatarBadge } from '../components/ProfileAvatarBadge';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { StatTile } from '../components/ui/StatTile';
import { Skeleton } from '../components/ui/Skeleton';

export function Leaderboard() {
  const { t } = useTranslation('leaderboard');
  const { formatPercent } = useFormatters();
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
  const topThree = items.slice(0, 3);
  const rest = items.slice(3);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-4 w-4 text-warning" aria-hidden="true" />;
      case 2:
        return <Medal className="h-4 w-4 text-slate-300" aria-hidden="true" />;
      case 3:
        return <Medal className="h-4 w-4 text-warning" aria-hidden="true" />;
      default:
        return (
          <span className="font-mono text-xs font-bold tabular-nums text-slate-500">#{rank}</span>
        );
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 pb-10 font-sans text-slate-100 md:gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">{t('title')}</h1>
        <p className="text-xs text-slate-500">{t('subtitle')}</p>
      </header>

      {currentStats ? (
        <Panel tone="accent" padding="default" as="section" className="animate-slide-down">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-accent-border bg-accent-muted text-accent-text">
                <Award className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold tracking-wider text-accent-text uppercase">
                  {t('standing.label')}
                </span>
                <h2 className="mt-0.5 truncate text-base font-bold text-slate-100">
                  {currentStats.rank
                    ? t('standing.ranked', { rank: currentStats.rank })
                    : t('standing.unranked')}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[32rem]">
              <StatTile label={t('standing.rating')} size="sm">
                {currentStats.rating}
              </StatTile>
              <StatTile label={t('standing.peakRating')} size="sm">
                {currentStats.highest_rating}
              </StatTile>
              <StatTile label={t('standing.matches')} size="sm">
                {currentStats.completed_matches}
              </StatTile>
              {currentStats.diff_to_previous_player !== null &&
              currentStats.diff_to_previous_player > 0 ? (
                <StatTile
                  label={
                    <span className="inline-flex items-center gap-1">
                      <Flame className="h-3 w-3" aria-hidden="true" /> {t('standing.nextTier')}
                    </span>
                  }
                  tone="accent"
                  size="sm"
                >
                  {t('standing.pointsToNext', { points: currentStats.diff_to_previous_player })}
                </StatTile>
              ) : (
                <StatTile label={t('standing.nextTier')} tone="muted" size="sm">
                  {t('standing.unranked')}
                </StatTile>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel
        padding="tight"
        as="section"
        className="flex flex-col gap-3 md:flex-row md:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label={t('filters.searchPlaceholder')}
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-control border border-border-subtle bg-surface-sunken pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <div className="relative">
            <select
              aria-label={t('filters.allBadges')}
              value={rankFilter}
              onChange={(e) => setRankFilter(e.target.value)}
              className="h-10 w-full appearance-none rounded-control border border-border-subtle bg-surface-sunken px-3 pr-8 text-xs text-slate-300 outline-none transition-colors focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15 sm:w-auto"
            >
              <option value="">{t('filters.allBadges')}</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
              <option value="blue">Blue</option>
              <option value="default">Default</option>
            </select>
            <Filter
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
          </div>
          <label className="flex h-10 items-center justify-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 text-xs font-semibold text-slate-400">
            <input
              type="checkbox"
              checked={onlyWithMatches}
              onChange={(e) => setOnlyWithMatches(e.target.checked)}
              className="h-4 w-4 rounded border-border-subtle bg-slate-950 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-950"
            />
            <span className="whitespace-nowrap">{t('filters.activeOnly')}</span>
          </label>
        </div>
      </Panel>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
          aria-label={t('loadingLabel', 'Loading leaderboard')}
        >
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-56" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Panel tone="sunken" className="p-12 text-center text-sm text-slate-500">
          {t('empty')}
        </Panel>
      ) : (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3 md:gap-4">
            {topThree[1] ? (
              <PodiumCard
                entry={topThree[1]}
                place="second"
                label={t('podium.second')}
                winRate={formatPercent(topThree[1].win_rate, 0)}
              />
            ) : (
              <div className="hidden md:block" />
            )}
            {topThree[0] ? (
              <PodiumCard
                entry={topThree[0]}
                place="first"
                label={t('podium.champion')}
                winRate={formatPercent(topThree[0].win_rate, 0)}
              />
            ) : null}
            {topThree[2] ? (
              <PodiumCard
                entry={topThree[2]}
                place="third"
                label={t('podium.third')}
                winRate={formatPercent(topThree[2].win_rate, 0)}
              />
            ) : (
              <div className="hidden md:block" />
            )}
          </div>

          {rest.length > 0 ? (
            <Panel padding="none" as="section" className="overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-left">
                  <thead className="hidden border-b border-border-subtle bg-surface-sunken text-[10px] font-bold tracking-wider text-slate-500 uppercase md:table-header-group">
                    <tr>
                      <th className="w-16 px-5 py-3 text-center">{t('table.rank')}</th>
                      <th className="px-5 py-3">{t('table.player')}</th>
                      <th className="px-5 py-3 text-center">{t('table.badge')}</th>
                      <th className="px-5 py-3 text-right">{t('table.rating')}</th>
                      <th className="px-5 py-3 text-right">{t('table.highestRating')}</th>
                      <th className="px-5 py-3 text-right">{t('table.matches')}</th>
                      <th className="px-5 py-3 text-right">{t('table.winRate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-xs">
                    {rest.map((entry) => (
                      <LeaderboardTableRow
                        key={entry.account_id}
                        entry={entry}
                        getRankBadge={getRankBadge}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}

type LeaderboardEntry = NonNullable<
  Awaited<ReturnType<typeof leaderboardApiV1LeaderboardGet>>
>['items'][number];

type PodiumPlace = 'first' | 'second' | 'third';

function PodiumCard({
  entry,
  place,
  label,
  winRate,
}: {
  entry: LeaderboardEntry;
  place: PodiumPlace;
  label: string;
  winRate: string;
}) {
  const { t } = useTranslation('leaderboard');
  const isFirst = place === 'first';
  return (
    <Link
      to={`/players/${entry.account_id}`}
      className={`group relative flex min-h-52 flex-col items-center justify-between overflow-hidden rounded-panel border p-5 text-center transition-all hover:-translate-y-1 hover:border-accent-border ${
        isFirst
          ? 'order-first border-accent-border bg-accent-muted shadow-lg shadow-purple-950/20 md:order-none md:min-h-60'
          : 'border-border-subtle bg-surface'
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <Badge size="xs" tone={isFirst ? 'warning' : 'neutral'}>
          {isFirst ? <Trophy className="h-3 w-3" aria-hidden="true" /> : null}
          {label}
        </Badge>
        <span className="font-mono text-xs tabular-nums text-slate-500">#{entry.rank}</span>
      </div>
      <ProfileAvatarBadge
        avatarText={entry.avatar_text}
        backgroundColor={entry.avatar_background_color}
        displayName={entry.display_name}
        label={entry.display_name}
        className={
          isFirst
            ? 'h-20 w-20 border-2 border-warning text-2xl shadow-lg'
            : 'h-16 w-16 border border-border-strong text-xl'
        }
      />
      <div className="min-w-0 max-w-full">
        <h3 className="truncate text-sm font-bold text-slate-100 group-hover:text-accent-text">
          {entry.display_name}
        </h3>
        <Badge size="xs" tone={isFirst ? 'accent' : 'neutral'} className="mt-1 max-w-full truncate">
          {entry.rank_badge_theme}
        </Badge>
      </div>
      <div>
        <p
          className={`font-black tabular-nums ${isFirst ? 'text-2xl text-warning' : 'text-xl text-slate-100'}`}
        >
          {entry.rating}
        </p>
        <p className="text-[10px] font-medium text-slate-500">
          {t('podium.winRate', { value: winRate })}
        </p>
      </div>
    </Link>
  );
}

function LeaderboardTableRow({
  entry,
  getRankBadge,
}: {
  entry: LeaderboardEntry;
  getRankBadge: (rank: number) => React.ReactNode;
}) {
  const { formatPercent } = useFormatters();
  return (
    <tr className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 p-4 transition-colors hover:bg-surface-hover md:table-row md:p-0">
      <td className="row-span-2 px-0 py-0 text-center md:table-cell md:px-5 md:py-3">
        {getRankBadge(entry.rank)}
      </td>
      <td className="min-w-0 px-0 py-0 md:table-cell md:px-5 md:py-3">
        <Link to={`/players/${entry.account_id}`} className="group flex min-w-0 items-center gap-3">
          <ProfileAvatarBadge
            avatarText={entry.avatar_text}
            backgroundColor={entry.avatar_background_color}
            displayName={entry.display_name}
            label={entry.display_name}
            className="h-8 w-8 text-xs"
          />
          <span className="truncate font-bold text-slate-200 group-hover:text-accent-text">
            {entry.display_name}
          </span>
        </Link>
      </td>
      <td className="hidden px-5 py-3 text-center md:table-cell">
        <Badge size="xs" tone="neutral">
          {entry.rank_badge_theme}
        </Badge>
      </td>
      <td className="px-0 py-0 text-right font-bold tabular-nums text-slate-200 md:table-cell md:px-5 md:py-3">
        {entry.rating}
      </td>
      <td className="hidden px-5 py-3 text-right font-medium tabular-nums text-slate-400 md:table-cell">
        {entry.highest_rating}
      </td>
      <td className="hidden px-5 py-3 text-right font-medium tabular-nums text-slate-400 md:table-cell">
        {entry.completed_matches}
      </td>
      <td className="col-start-2 px-0 py-0 text-[10px] font-bold tabular-nums text-success md:table-cell md:px-5 md:py-3 md:text-right md:text-xs">
        {formatPercent(entry.win_rate, 0)}
      </td>
    </tr>
  );
}

export default Leaderboard;
