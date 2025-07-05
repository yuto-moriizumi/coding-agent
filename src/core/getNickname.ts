export function getNickname(): string {
  return process.env.NICKNAME || 'Volga';
}