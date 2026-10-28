/**
 * O código da sala em casas separadas, como numa senha de banco: fica fácil
 * de ditar em voz alta e de conferir letra por letra.
 */
export function RoomCode({ code, size = 'lg' }: { code: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-11 text-3xl' : 'h-11 w-9 text-2xl';
  return (
    <span className="flex gap-1.5" role="img" aria-label={`Código ${code.split('').join(' ')}`}>
      {code.split('').map((char, index) => (
        <span
          key={index}
          aria-hidden
          translate="no"
          className={`flex items-center justify-center rounded-xl border border-line bg-ink font-display font-extrabold ${box}`}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
