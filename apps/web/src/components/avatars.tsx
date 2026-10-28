import type { PlayerView, SeatAvatar as SeatAvatarData } from '@quem/shared';

/** Avatar sorteado de um lugar do chat: emoji sobre uma cor. Não revela ninguém. */
export function SeatAvatar({ avatar, size = 36 }: { avatar: SeatAvatarData; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: avatar.color, fontSize: size * 0.55 }}
    >
      {avatar.emoji}
    </span>
  );
}

/** Foto do jogador (enviada para o S3) ou a inicial do apelido. */
export function PlayerAvatar({
  player,
  size = 40,
}: {
  player: Pick<PlayerView, 'nickname' | 'avatarUrl'>;
  size?: number;
}) {
  if (player.avatarUrl) {
    return (
      <img
        src={player.avatarUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-display font-bold text-muted"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
