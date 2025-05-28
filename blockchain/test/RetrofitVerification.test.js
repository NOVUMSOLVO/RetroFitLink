const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RetrofitVerification", function () {
  let retrofitVerification;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const RetrofitVerification = await ethers.getContractFactory("RetrofitVerification");
    retrofitVerification = await RetrofitVerification.deploy();
    await retrofitVerification.deployed();
  });

  describe("Adding verification records", function () {
    it("Should add a verification record", async function () {
      const propertyId = 1;
      const retrofitId = 1;
      const sensorDataHash = "0x1234567890abcdef";

      await retrofitVerification.addVerificationRecord(propertyId, retrofitId, sensorDataHash);

      const record = await retrofitVerification.records(1);
      expect(record.propertyId).to.equal(propertyId);
      expect(record.retrofitId).to.equal(retrofitId);
      expect(record.sensorDataHash).to.equal(sensorDataHash);
    });

    it("Should increment record count", async function () {
      await retrofitVerification.addVerificationRecord(1, 1, "0x123");
      expect(await retrofitVerification.recordCount()).to.equal(1);

      await retrofitVerification.addVerificationRecord(2, 2, "0x456");
      expect(await retrofitVerification.recordCount()).to.equal(2);
    });

    it("Should emit RecordAdded event", async function () {
      await expect(retrofitVerification.addVerificationRecord(1, 1, "0x123"))
        .to.emit(retrofitVerification, "RecordAdded")
        .withArgs(1, 1, 1, "0x123");
    });
  });
});
