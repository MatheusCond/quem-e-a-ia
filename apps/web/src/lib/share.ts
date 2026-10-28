export function roomLink(code: string): string {
  return `${window.location.origin}/sala/${code}`;
}

export function whatsappShareUrl(code: string): string {
  const text = `Bora jogar *Quem é a IA?* Um de nós vai ser uma IA no chat. Entra aqui: ${roomLink(code)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyRoomLink(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(roomLink(code));
    return true;
  } catch {
    return false;
  }
}
