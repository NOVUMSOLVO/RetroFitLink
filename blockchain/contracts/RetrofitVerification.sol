// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RetrofitVerification {
    struct VerificationRecord {
        uint256 propertyId;
        uint256 retrofitId;
        uint256 timestamp;
        string sensorDataHash;
    }

    mapping(uint256 => VerificationRecord) public records;
    uint256 public recordCount;

    event RecordAdded(
        uint256 indexed recordId,
        uint256 indexed propertyId,
        uint256 indexed retrofitId,
        string sensorDataHash
    );

    function addVerificationRecord(
        uint256 _propertyId,
        uint256 _retrofitId,
        string memory _sensorDataHash
    ) public {
        recordCount++;
        records[recordCount] = VerificationRecord(
            _propertyId,
            _retrofitId,
            block.timestamp,
            _sensorDataHash
        );
        emit RecordAdded(recordCount, _propertyId, _retrofitId, _sensorDataHash);
    }
}
