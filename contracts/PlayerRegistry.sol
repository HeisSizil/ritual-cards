// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @notice Lets any address claim a single, unique username.
contract PlayerRegistry {
  // address -> username, for looking up a player's registered name.
  mapping(address => string) private usernames;

  // username -> address, for looking up who owns a given name and
  // for cheaply checking whether a name is already taken.
  mapping(string => address) private addresses;

  event UsernameRegistered(address indexed player, string username);

  error UsernameAlreadyRegistered(address player, string existingUsername);
  error UsernameAlreadyTaken(string username);

  /// @notice Registers `username` for the caller.
  /// @dev Reverts if the caller already has a username, or if `username`
  ///      is already owned by a different address.
  function registerUsername(string calldata username) external {
    // Empty string is used as the "no username" sentinel below, so a
    // player is only allowed to register once.
    if (bytes(usernames[msg.sender]).length != 0) {
      revert UsernameAlreadyRegistered(msg.sender, usernames[msg.sender]);
    }

    // addresses[username] defaults to address(0) when unset, meaning
    // it is free to claim.
    if (addresses[username] != address(0)) {
      revert UsernameAlreadyTaken(username);
    }

    usernames[msg.sender] = username;
    addresses[username] = msg.sender;

    emit UsernameRegistered(msg.sender, username);
  }

  /// @notice Returns the username registered to `player`, or "" if none.
  function getUsername(address player) external view returns (string memory) {
    return usernames[player];
  }

  /// @notice Returns the address that owns `username`, or address(0) if none.
  function getAddress(string calldata username) external view returns (address) {
    return addresses[username];
  }
}
