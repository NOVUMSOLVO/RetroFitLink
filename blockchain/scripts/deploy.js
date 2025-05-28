const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying RetrofitVerification contract...");

  const RetrofitVerification = await ethers.getContractFactory("RetrofitVerification");
  const retrofitVerification = await RetrofitVerification.deploy();

  await retrofitVerification.deployed();

  console.log("RetrofitVerification deployed to:", retrofitVerification.address);
  console.log("Save this address to your .env file as RETROFIT_CONTRACT_ADDRESS");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
