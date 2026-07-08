import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("PlayerRegistry", function () {
  // Deploy a fresh registry once and reuse the snapshot across tests.
  async function deployRegistryFixture() {
    const [alice, bob] = await hre.ethers.getSigners();

    const PlayerRegistry = await hre.ethers.getContractFactory("PlayerRegistry");
    const registry = await PlayerRegistry.deploy();

    // registry.getAddress() is reserved by ethers (returns the contract's
    // own deployed address), which shadows our getAddress(string) view
    // function of the same name. Resolve the overload explicitly so calls
    // reach our contract's function instead of the built-in one.
    const getAddressFor = registry.getFunction("getAddress(string)");

    return { registry, alice, bob, getAddressFor };
  }

  describe("Happy path", function () {
    it("Should register a username for the caller", async function () {
      const { registry, alice, getAddressFor } = await loadFixture(deployRegistryFixture);

      await registry.connect(alice).registerUsername("alice");

      expect(await registry.getUsername(alice.address)).to.equal("alice");
      expect(await getAddressFor("alice")).to.equal(alice.address);
    });

    it("Should allow different addresses to register different usernames", async function () {
      const { registry, alice, bob, getAddressFor } = await loadFixture(deployRegistryFixture);

      await registry.connect(alice).registerUsername("alice");
      await registry.connect(bob).registerUsername("bob");

      expect(await registry.getUsername(alice.address)).to.equal("alice");
      expect(await registry.getUsername(bob.address)).to.equal("bob");
      expect(await getAddressFor("alice")).to.equal(alice.address);
      expect(await getAddressFor("bob")).to.equal(bob.address);
    });

    it("Should emit UsernameRegistered on registration", async function () {
      const { registry, alice } = await loadFixture(deployRegistryFixture);

      await expect(registry.connect(alice).registerUsername("alice"))
        .to.emit(registry, "UsernameRegistered")
        .withArgs(alice.address, "alice");
    });

    it("Should return empty string / zero address for unregistered lookups", async function () {
      const { registry, alice, getAddressFor } = await loadFixture(deployRegistryFixture);

      expect(await registry.getUsername(alice.address)).to.equal("");
      expect(await getAddressFor("nobody")).to.equal(hre.ethers.ZeroAddress);
    });
  });

  describe("Reverts", function () {
    it("Should revert if the caller already has a username registered", async function () {
      const { registry, alice } = await loadFixture(deployRegistryFixture);

      await registry.connect(alice).registerUsername("alice");

      await expect(registry.connect(alice).registerUsername("alice2"))
        .to.be.revertedWithCustomError(registry, "UsernameAlreadyRegistered")
        .withArgs(alice.address, "alice");
    });

    it("Should revert if the username is already taken by another address", async function () {
      const { registry, alice, bob } = await loadFixture(deployRegistryFixture);

      await registry.connect(alice).registerUsername("alice");

      await expect(registry.connect(bob).registerUsername("alice"))
        .to.be.revertedWithCustomError(registry, "UsernameAlreadyTaken")
        .withArgs("alice");
    });
  });
});
