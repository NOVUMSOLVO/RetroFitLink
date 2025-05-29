const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../../backend/utils/logger');

/**
 * Gas optimization service for blockchain transactions
 */
class GasOptimizer {
  constructor(provider, config) {
    this.provider = provider;
    this.config = {
      maxGasPrice: ethers.utils.parseUnits('150', 'gwei'),
      minGasPrice: ethers.utils.parseUnits('5', 'gwei'),
      gasPriceBuffer: 10, // 10% buffer
      batchSize: 10,
      gasOracleUrl: process.env.GAS_ORACLE_URL || 'https://api.etherscan.io/api?module=gastracker&action=gasoracle',
      gasOracleTimeout: 5000,
      retryDelay: 15000,
      maxRetries: 3,
      ...config
    };
    
    this.lastGasPrice = null;
    this.lastGasPriceTimestamp = 0;
    this.gasPriceCacheTTL = 60000; // 1 minute
  }

  /**
   * Batch multiple verifications in a single transaction
   * @param {Array} verifications Array of verification objects
   * @param {Object} contract Contract instance
   * @param {Object} options Transaction options
   * @returns {Promise} Transaction result
   */
  async batchVerifications(verifications, contract, options = {}) {
    try {
      const batchSize = this.config.batchSize;
      const batches = [];
      
      // Split into batches
      for (let i = 0; i < verifications.length; i += batchSize) {
        batches.push(verifications.slice(i, i + batchSize));
      }
      
      logger.info(`Splitting ${verifications.length} verifications into ${batches.length} batches`);
      
      // Process each batch
      const results = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        logger.info(`Processing batch ${i + 1}/${batches.length} with ${batch.length} verifications`);
        
        // Create encoded verification data
        const encodedData = batch.map(verification => {
          return ethers.utils.defaultAbiCoder.encode(
            ['string', 'string', 'string', 'uint256', 'uint256', 'string[]'],
            [
              verification.retrofitId,
              verification.propertyCID,
              verification.energyCID,
              verification.energyRatingBefore,
              verification.energyRatingAfter,
              verification.workTypes
            ]
          );
        });
        
        // Estimate gas
        const gasLimit = await this.estimateGasForBatch(
          contract,
          'batchVerify',
          [encodedData],
          options
        );
        
        // Get optimal gas price
        const gasPrice = await this.estimateOptimalGasPrice();
        
        // Execute transaction
        const tx = await contract.batchVerify(encodedData, {
          gasLimit,
          gasPrice,
          ...options
        });
        
        logger.info(`Batch ${i + 1} transaction submitted: ${tx.hash}`);
        
        // Wait for receipt
        const receipt = await tx.wait();
        
        logger.info(`Batch ${i + 1} confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed.toString()}`);
        
        results.push({
          batchIndex: i,
          batchSize: batch.length,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          status: receipt.status
        });
      }
      
      return {
        totalVerifications: verifications.length,
        batches: results,
        success: true
      };
    } catch (error) {
      logger.error('Batch verification error:', error);
      throw error;
    }
  }

  /**
   * Estimate gas for a batch operation
   * @param {Object} contract Contract instance
   * @param {String} method Method name
   * @param {Array} params Method parameters
   * @param {Object} options Transaction options
   * @returns {BigNumber} Estimated gas with buffer
   */
  async estimateGasForBatch(contract, method, params, options = {}) {
    try {
      // Estimate gas for the operation
      const gasEstimate = await contract.estimateGas[method](...params, options);
      
      // Add 20% buffer to avoid out-of-gas errors
      const gasBuffer = gasEstimate.mul(20).div(100);
      const gasLimit = gasEstimate.add(gasBuffer);
      
      logger.debug(`Gas estimation for ${method}: ${gasEstimate.toString()} + ${gasBuffer.toString()} buffer = ${gasLimit.toString()}`);
      
      return gasLimit;
    } catch (error) {
      logger.error(`Gas estimation error for ${method}:`, error);
      throw new Error(`Gas estimation failed: ${error.message}`);
    }
  }

  /**
   * Estimate optimal gas price
   * @returns {BigNumber} Optimal gas price in wei
   */
  async estimateOptimalGasPrice() {
    try {
      const now = Date.now();
      
      // Return cached gas price if still valid
      if (this.lastGasPrice && now - this.lastGasPriceTimestamp < this.gasPriceCacheTTL) {
        return this.lastGasPrice;
      }
      
      let gasPrice;
      
      // Try to get from oracle first
      try {
        const response = await axios.get(this.config.gasOracleUrl, {
          timeout: this.config.gasOracleTimeout
        });
        
        if (response.data.status === '1' && response.data.result) {
          // Parse gas price from oracle (based on etherscan-style response)
          const gasPriceGwei = response.data.result.ProposeGasPrice || 
                             response.data.result.SafeGasPrice || 
                             response.data.result.suggestBaseFee || 
                             '20';
          
          gasPrice = ethers.utils.parseUnits(gasPriceGwei, 'gwei');
          
          logger.info(`Gas price from oracle: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
        } else {
          throw new Error('Invalid gas oracle response');
        }
      } catch (oracleError) {
        logger.warn('Gas oracle error, falling back to network gas price:', oracleError);
        
        // Fallback to network gas price
        gasPrice = await this.provider.getGasPrice();
        
        logger.info(`Network gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
      }
      
      // Add buffer for faster inclusion
      const bufferedGasPrice = gasPrice.mul(100 + this.config.gasPriceBuffer).div(100);
      
      // Ensure within limits
      const finalGasPrice = ethers.BigNumber.from(
        Math.min(
          Math.max(
            bufferedGasPrice.toNumber(),
            this.config.minGasPrice.toNumber()
          ),
          this.config.maxGasPrice.toNumber()
        )
      );
      
      logger.info(`Final gas price: ${ethers.utils.formatUnits(finalGasPrice, 'gwei')} Gwei`);
      
      // Cache the result
      this.lastGasPrice = finalGasPrice;
      this.lastGasPriceTimestamp = now;
      
      return finalGasPrice;
    } catch (error) {
      logger.error('Gas price estimation error:', error);
      
      // In case of error, return a reasonable default
      const defaultGasPrice = ethers.utils.parseUnits('30', 'gwei');
      logger.info(`Using default gas price: ${ethers.utils.formatUnits(defaultGasPrice, 'gwei')} Gwei`);
      
      return defaultGasPrice;
    }
  }

  /**
   * Get gas usage statistics
   * @param {String} contractAddress Contract address
   * @param {Number} days Number of days to look back
   * @returns {Object} Gas usage statistics
   */
  async getGasUsageStats(contractAddress, days = 7) {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const blocksPerDay = 7200; // Approximate for Ethereum
      const fromBlock = blockNumber - (blocksPerDay * days);
      
      // Get contract transaction history
      const filter = {
        address: contractAddress,
        fromBlock: Math.max(fromBlock, 0),
        toBlock: 'latest'
      };
      
      const events = await this.provider.getLogs(filter);
      
      // Process transactions to get gas usage
      const transactions = await Promise.all(events.map(async (event) => {
        const tx = await this.provider.getTransactionReceipt(event.transactionHash);
        return {
          hash: tx.transactionHash,
          blockNumber: tx.blockNumber,
          gasUsed: tx.gasUsed.toString(),
          effectiveGasPrice: tx.effectiveGasPrice ? tx.effectiveGasPrice.toString() : '0',
          cost: tx.gasUsed.mul(tx.effectiveGasPrice || 0).toString(),
          timestamp: (await this.provider.getBlock(tx.blockNumber)).timestamp
        };
      }));
      
      // Calculate statistics
      const totalGasUsed = transactions.reduce(
        (acc, tx) => acc.add(ethers.BigNumber.from(tx.gasUsed)),
        ethers.BigNumber.from(0)
      );
      
      const totalCost = transactions.reduce(
        (acc, tx) => acc.add(ethers.BigNumber.from(tx.cost)),
        ethers.BigNumber.from(0)
      );
      
      const avgGasUsed = transactions.length > 0 ?
        totalGasUsed.div(transactions.length).toString() : '0';
        
      const avgCost = transactions.length > 0 ?
        ethers.utils.formatEther(totalCost.div(transactions.length)) : '0';
      
      return {
        totalTransactions: transactions.length,
        totalGasUsed: totalGasUsed.toString(),
        totalCostEth: ethers.utils.formatEther(totalCost),
        avgGasUsed,
        avgCostEth: avgCost,
        period: {
          days,
          fromBlock,
          toBlock: blockNumber
        },
        transactions: transactions.slice(0, 10) // Return only the last 10 transactions
      };
    } catch (error) {
      logger.error('Gas statistics error:', error);
      throw error;
    }
  }
  
  /**
   * Monitor gas prices and alert on significant changes
   * @param {Number} threshold Percentage change threshold for alerts
   * @param {Number} interval Polling interval in milliseconds
   */
  monitorGasPrices(threshold = 20, interval = 300000) {
    let lastPrice = null;
    
    const checkGasPrice = async () => {
      try {
        const currentPrice = await this.estimateOptimalGasPrice();
        
        if (lastPrice) {
          const percentChange = Math.abs(
            ((currentPrice.toNumber() - lastPrice.toNumber()) / lastPrice.toNumber()) * 100
          );
          
          if (percentChange >= threshold) {
            const direction = currentPrice.gt(lastPrice) ? 'increased' : 'decreased';
            
            logger.warn(`Gas price ${direction} by ${percentChange.toFixed(2)}%`, {
              from: ethers.utils.formatUnits(lastPrice, 'gwei'),
              to: ethers.utils.formatUnits(currentPrice, 'gwei'),
              percentChange: percentChange.toFixed(2),
              timestamp: new Date().toISOString()
            });
            
            // In production, send alerts to monitoring system
          }
        }
        
        lastPrice = currentPrice;
      } catch (error) {
        logger.error('Gas price monitoring error:', error);
      }
    };
    
    // Initial check
    checkGasPrice();
    
    // Set up interval
    const monitorInterval = setInterval(checkGasPrice, interval);
    
    // Return function to stop monitoring
    return () => clearInterval(monitorInterval);
  }
}

module.exports = GasOptimizer;
