// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title RetrofitVerificationV1
 * @dev Upgradeable smart contract for verifying energy retrofit projects
 */
contract RetrofitVerificationV1 is Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    // State variables
    struct Retrofit {
        string retrofitId;
        address verifier;
        uint256 timestamp;
        string propertyCID;  // IPFS CID for property data
        string energyCID;    // IPFS CID for energy data
        bool isVerified;
        uint256 energyRatingBefore;
        uint256 energyRatingAfter;
        string[] workTypes;
    }

    // Events
    event RetrofitVerified(string indexed retrofitId, address verifier, uint256 timestamp);
    event RetrofitUpdated(string indexed retrofitId, address updater, uint256 timestamp);
    event BatchVerification(uint256 count, address verifier, uint256 timestamp);
    event VerifierAdded(address verifier, uint256 timestamp);
    event VerifierRemoved(address verifier, uint256 timestamp);

    // Mappings
    mapping(string => Retrofit) private retrofits;
    mapping(address => bool) private verifiers;
    string[] private retrofitIds;
    
    // Constants
    uint256 private constant MAX_BATCH_SIZE = 50;
    
    // Version tracking
    string private _version;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer function (replaces constructor in upgradeable contracts)
     */
    function initialize() public initializer {
        __Ownable_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _version = "1.0.0";
    }

    /**
     * @dev Add authorized verifier
     * @param verifier Address of the verifier to add
     */
    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid verifier address");
        require(!verifiers[verifier], "Verifier already exists");
        
        verifiers[verifier] = true;
        emit VerifierAdded(verifier, block.timestamp);
    }

    /**
     * @dev Remove authorized verifier
     * @param verifier Address of the verifier to remove
     */
    function removeVerifier(address verifier) external onlyOwner {
        require(verifiers[verifier], "Verifier does not exist");
        
        verifiers[verifier] = false;
        emit VerifierRemoved(verifier, block.timestamp);
    }

    /**
     * @dev Check if an address is an authorized verifier
     * @param verifier Address to check
     * @return bool True if address is an authorized verifier
     */
    function isVerifier(address verifier) public view returns (bool) {
        return verifiers[verifier];
    }

    /**
     * @dev Verify a retrofit
     * @param retrofitId Unique ID of the retrofit
     * @param propertyCID IPFS CID of property data
     * @param energyCID IPFS CID of energy data
     * @param energyRatingBefore Energy rating before retrofit
     * @param energyRatingAfter Energy rating after retrofit
     * @param workTypes Array of work types performed
     */
    function verifyRetrofit(
        string memory retrofitId,
        string memory propertyCID,
        string memory energyCID,
        uint256 energyRatingBefore,
        uint256 energyRatingAfter,
        string[] memory workTypes
    ) external whenNotPaused {
        require(verifiers[msg.sender] || owner() == msg.sender, "Not authorized");
        require(bytes(retrofitId).length > 0, "Invalid retrofit ID");
        require(bytes(propertyCID).length > 0, "Invalid property CID");
        require(bytes(energyCID).length > 0, "Invalid energy CID");
        require(energyRatingBefore < energyRatingAfter, "Invalid energy ratings");
        require(workTypes.length > 0, "Work types required");
        
        // Create new retrofit if it doesn't exist
        if (bytes(retrofits[retrofitId].retrofitId).length == 0) {
            retrofitIds.push(retrofitId);
        }
        
        // Update retrofit data
        retrofits[retrofitId] = Retrofit({
            retrofitId: retrofitId,
            verifier: msg.sender,
            timestamp: block.timestamp,
            propertyCID: propertyCID,
            energyCID: energyCID,
            isVerified: true,
            energyRatingBefore: energyRatingBefore,
            energyRatingAfter: energyRatingAfter,
            workTypes: workTypes
        });
        
        emit RetrofitVerified(retrofitId, msg.sender, block.timestamp);
    }

    /**
     * @dev Batch verify multiple retrofits
     * @param retrofitData Array of retrofit data packed as bytes
     */
    function batchVerify(bytes[] calldata retrofitData) external whenNotPaused {
        require(verifiers[msg.sender] || owner() == msg.sender, "Not authorized");
        require(retrofitData.length <= MAX_BATCH_SIZE, "Batch too large");
        require(retrofitData.length > 0, "Empty batch");
        
        uint256 processedCount = 0;
        
        for (uint256 i = 0; i < retrofitData.length; i++) {
            // Process each retrofit entry
            // The implementation would decode the bytes into the proper parameters
            // and call an internal version of verifyRetrofit
            // This is a simplified version that assumes proper encoding in the bytes array
            
            // Example of what would happen in a real implementation:
            // (string memory retrofitId, string memory propertyCID, ...) = 
            //    abi.decode(retrofitData[i], (string, string, ...));
            
            // Internal verification logic
            processedCount++;
        }
        
        emit BatchVerification(processedCount, msg.sender, block.timestamp);
    }

    /**
     * @dev Get retrofit details
     * @param retrofitId ID of the retrofit to query
     * @return Retrofit struct with all details
     */
    function getRetrofit(string memory retrofitId) external view returns (Retrofit memory) {
        require(bytes(retrofits[retrofitId].retrofitId).length > 0, "Retrofit not found");
        return retrofits[retrofitId];
    }

    /**
     * @dev Get all retrofit IDs (paginated)
     * @param offset Starting position
     * @param limit Maximum number of IDs to return
     * @return Array of retrofit IDs
     */
    function getRetrofitIds(uint256 offset, uint256 limit) external view returns (string[] memory) {
        require(offset < retrofitIds.length, "Offset out of bounds");
        
        // Calculate actual limit
        uint256 actualLimit = limit;
        if (offset + limit > retrofitIds.length) {
            actualLimit = retrofitIds.length - offset;
        }
        
        // Create result array
        string[] memory result = new string[](actualLimit);
        
        // Populate result array
        for (uint256 i = 0; i < actualLimit; i++) {
            result[i] = retrofitIds[offset + i];
        }
        
        return result;
    }

    /**
     * @dev Get total number of retrofits
     * @return Total count of retrofits
     */
    function getTotalRetrofits() external view returns (uint256) {
        return retrofitIds.length;
    }

    /**
     * @dev Get contract version
     * @return Current contract version
     */
    function getVersion() external view returns (string memory) {
        return _version;
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Function that should revert when msg.sender is not authorized to upgrade the contract
     * Called by {upgradeTo} and {upgradeToAndCall}
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Additional authorization logic could be added here
    }
}
