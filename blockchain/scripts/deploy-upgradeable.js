// Script for deploying upgradeable RetrofitVerification contract
const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Starting deployment of upgradeable RetrofitVerification contract...");

  // Get the contract factory
  const RetrofitVerification = await ethers.getContractFactory("RetrofitVerificationV1");
  
  console.log("Deploying RetrofitVerificationV1...");
  
  // Deploy as upgradeable contract using the proxy pattern
  const proxy = await upgrades.deployProxy(RetrofitVerification, [], {
    initializer: 'initialize',
    kind: 'uups'
  });
  
  // Wait for deployment to complete
  await proxy.deployed();
  
  console.log("Proxy contract deployed to:", proxy.address);
  
  // Get the implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxy.address
  );
  
  console.log("Implementation contract deployed to:", implementationAddress);
  
  // Log deployment information for verification
  console.log(`
Deployment details:
- Proxy: ${proxy.address}
- Implementation: ${implementationAddress}
- Network: ${network.name}
- Time: ${new Date().toISOString()}

To verify the implementation contract:
npx hardhat verify --network ${network.name} ${implementationAddress}
  `);
  
  return { proxy: proxy.address, implementation: implementationAddress };
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
