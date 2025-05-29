// Script for upgrading RetrofitVerification contract
const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  
  if (!proxyAddress) {
    throw new Error("PROXY_ADDRESS environment variable not set");
  }
  
  console.log(`Starting upgrade for proxy at ${proxyAddress}...`);

  // Get the new contract factory (V2)
  const RetrofitVerificationV2 = await ethers.getContractFactory("RetrofitVerificationV2");
  
  console.log("Preparing upgrade to RetrofitVerificationV2...");
  
  // Upgrade the proxy to the new implementation
  const upgraded = await upgrades.upgradeProxy(proxyAddress, RetrofitVerificationV2);
  
  // Wait for upgrade to complete
  await upgraded.deployed();
  
  // Get the new implementation address
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );
  
  console.log(`Upgrade complete!`);
  console.log(`- Proxy address: ${proxyAddress}`);
  console.log(`- New implementation address: ${newImplementationAddress}`);
  console.log(`- Network: ${network.name}`);
  console.log(`- Time: ${new Date().toISOString()}`);
  
  // Log verification info
  console.log(`
To verify the new implementation contract:
npx hardhat verify --network ${network.name} ${newImplementationAddress}
  `);
}

// Execute upgrade
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
  });
