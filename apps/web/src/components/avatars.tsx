import type { PlayerView, SeatAvatar as SeatAvatarData, SeatView } from '@quem/shared';

/** Avatar sorteado de um lugar do chat: emoji sobre uma cor. Não revela ninguém. */
export function SeatAvatar({ avatar, size = 36 }: { avatar: SeatAvatarData; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full select-none"
      style={{ width: size, height: size, background: avatar.color, fontSize: size * 0.55 }}
    >
      {avatar.emoji}
    </span>
  );
}

/** Avatares sobrepostos, como o ícone de um grupo. */
export function SeatStack({ seats, size = 26 }: { seats: SeatView[]; size?: number }) {
  const shown = seats.slice(0, 4);
  return (
    <span className="flex shrink-0" aria-hidden>
      {shown.map((seat, index) => (
        <span
          key={seat.seatId}
          className="rounded-full ring-2 ring-night"
          style={{ marginLeft: index === 0 ? 0 : -size * 0.38 }}
        >
          <SeatAvatar avatar={seat.avatar} size={size} />
        </span>
      ))}
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
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-display font-bold text-muted select-none"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
