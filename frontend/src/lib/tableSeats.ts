type SeatedPlayer = {
  account_id: number;
  seat: number;
};

/**
 * Preserve the server's clockwise seat order while rotating the viewer to the
 * first visual position. Real seat numbers may contain gaps after eliminations.
 */
export function orderPlayersForViewer<Player extends SeatedPlayer>(
  players: readonly Player[],
  viewerAccountId: number | undefined,
): Player[] {
  const bySeat = [...players].sort(
    (left, right) => left.seat - right.seat || left.account_id - right.account_id,
  );
  const viewerIndex = bySeat.findIndex((player) => player.account_id === viewerAccountId);

  if (viewerIndex <= 0) return bySeat;
  return [...bySeat.slice(viewerIndex), ...bySeat.slice(0, viewerIndex)];
}
