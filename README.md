# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

## Deployed Addresses (Ritual testnet, chain ID 1979)

| Contract | Address |
|---|---|
| FairDeck | `0x9310d706138b7A8E7B85388678281c3bdC641D2C` |
| Leaderboard | `0xa8EE1C6ECAa6BF35F1faaCEC4E73032f984804Dc` |
| WhotGame | `0xDBf93577c4005F98524DF3C429c788A34B39Bd9a` |
| PlayerRegistry | `0x6477df397688Cf8eCd63b029Fb46D274BfcC2582` |

Note: Leaderboard now uses OpenZeppelin's `Ownable`, which WhotGame relies on via the authorized-caller wiring above.
