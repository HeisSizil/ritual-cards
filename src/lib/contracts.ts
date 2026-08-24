export const RITUAL_CHAIN_ID = 1979;

export const CONTRACTS = {
  PlayerRegistry: "0x6477df397688Cf8eCd63b029Fb46D274BfcC2582",
  FairDeck: "0x9310d706138b7A8E7B85388678281c3bdC641D2C",
  WhotGame: "0xDBf93577c4005F98524DF3C429c788A34B39Bd9a",
  Leaderboard: "0xa8EE1C6ECAa6BF35F1faaCEC4E73032f984804Dc",
} as const;

export type ContractName = keyof typeof CONTRACTS;

export function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
