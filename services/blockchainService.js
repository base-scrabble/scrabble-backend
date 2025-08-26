const { ethers } = require('ethers');

class BlockchainService {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractAddress = process.env.SMART_CONTRACT_ADDRESS;
        this.privateKey = process.env.WALLET_PRIVATE_KEY;
        this.rpcUrl = process.env.RPC_URL || 'https://polygon-rpc.com';
        
        this.init();
    }

    async init() {
        try {
            // Initialize provider
            this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
            
            // Initialize wallet if private key is provided
            if (this.privateKey) {
                this.wallet = new ethers.Wallet(this.privateKey, this.provider);
            }

            // Contract ABI for tournament winner reporting
            this.contractABI = [
                {
                    "inputs": [
                        {"name": "tournamentId", "type": "uint256"},
                        {"name": "winnerId", "type": "uint256"},
                        {"name": "winnerAddress", "type": "address"},
                        {"name": "prizeAmount", "type": "uint256"},
                        {"name": "timestamp", "type": "uint256"}
                    ],
                    "name": "reportTournamentWinner",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        {"name": "tournamentId", "type": "uint256"},
                        {"name": "gameId", "type": "uint256"},
                        {"name": "winnerId", "type": "uint256"},
                        {"name": "winnerAddress", "type": "address"},
                        {"name": "finalScore", "type": "uint256"},
                        {"name": "timestamp", "type": "uint256"}
                    ],
                    "name": "reportGameWinner",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        {"name": "tournamentId", "type": "uint256"}
                    ],
                    "name": "getTournamentWinner",
                    "outputs": [
                        {"name": "winnerId", "type": "uint256"},
                        {"name": "winnerAddress", "type": "address"},
                        {"name": "prizeAmount", "type": "uint256"},
                        {"name": "timestamp", "type": "uint256"}
                    ],
                    "stateMutability": "view",
                    "type": "function"
                }
            ];

            // Initialize contract if address is provided
            if (this.contractAddress && this.wallet) {
                this.contract = new ethers.Contract(
                    this.contractAddress,
                    this.contractABI,
                    this.wallet
                );
            }

            console.log('🔗 Blockchain service initialized');
        } catch (error) {
            console.error('❌ Blockchain service initialization failed:', error);
        }
    }

    /**
     * Report tournament winner to smart contract
     * @param {Object} tournamentData - Tournament winner data
     * @returns {Promise<Object>} - Transaction result
     */
    async reportTournamentWinner(tournamentData) {
        try {
            if (!this.contract) {
                throw new Error('Smart contract not initialized');
            }

            const {
                tournamentId,
                winnerId,
                winnerAddress,
                prizeAmount,
                timestamp = Math.floor(Date.now() / 1000)
            } = tournamentData;

            // Validate required fields
            if (!tournamentId || !winnerId || !winnerAddress) {
                throw new Error('Missing required tournament winner data');
            }

            // Convert values to appropriate types
            const tx = await this.contract.reportTournamentWinner(
                ethers.getBigInt(tournamentId),
                ethers.getBigInt(winnerId),
                winnerAddress,
                ethers.parseEther(prizeAmount.toString() || '0'),
                ethers.getBigInt(timestamp)
            );

            console.log(`📝 Tournament winner reported to blockchain: ${tx.hash}`);
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            };
        } catch (error) {
            console.error('❌ Failed to report tournament winner:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Report individual game winner to smart contract
     * @param {Object} gameData - Game winner data
     * @returns {Promise<Object>} - Transaction result
     */
    async reportGameWinner(gameData) {
        try {
            if (!this.contract) {
                throw new Error('Smart contract not initialized');
            }

            const {
                tournamentId,
                gameId,
                winnerId,
                winnerAddress,
                finalScore,
                timestamp = Math.floor(Date.now() / 1000)
            } = gameData;

            // Validate required fields
            if (!tournamentId || !gameId || !winnerId || !winnerAddress) {
                throw new Error('Missing required game winner data');
            }

            const tx = await this.contract.reportGameWinner(
                ethers.getBigInt(tournamentId),
                ethers.getBigInt(gameId),
                ethers.getBigInt(winnerId),
                winnerAddress,
                ethers.getBigInt(finalScore || 0),
                ethers.getBigInt(timestamp)
            );

            console.log(`🎮 Game winner reported to blockchain: ${tx.hash}`);
            
            const receipt = await tx.wait();
            
            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            };
        } catch (error) {
            console.error('❌ Failed to report game winner:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get tournament winner from smart contract
     * @param {number} tournamentId - Tournament ID
     * @returns {Promise<Object>} - Winner data
     */
    async getTournamentWinner(tournamentId) {
        try {
            if (!this.contract) {
                throw new Error('Smart contract not initialized');
            }

            const result = await this.contract.getTournamentWinner(
                ethers.getBigInt(tournamentId)
            );

            return {
                success: true,
                data: {
                    winnerId: result.winnerId.toString(),
                    winnerAddress: result.winnerAddress,
                    prizeAmount: ethers.formatEther(result.prizeAmount),
                    timestamp: parseInt(result.timestamp.toString())
                }
            };
        } catch (error) {
            console.error('❌ Failed to get tournament winner:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Estimate gas for tournament winner reporting
     * @param {Object} tournamentData - Tournament data
     * @returns {Promise<Object>} - Gas estimation
     */
    async estimateGas(tournamentData) {
        try {
            if (!this.contract) {
                throw new Error('Smart contract not initialized');
            }

            const {
                tournamentId,
                winnerId,
                winnerAddress,
                prizeAmount,
                timestamp = Math.floor(Date.now() / 1000)
            } = tournamentData;

            const gasEstimate = await this.contract.reportTournamentWinner.estimateGas(
                ethers.getBigInt(tournamentId),
                ethers.getBigInt(winnerId),
                winnerAddress,
                ethers.parseEther(prizeAmount.toString() || '0'),
                ethers.getBigInt(timestamp)
            );

            const gasPrice = await this.provider.getFeeData();

            return {
                success: true,
                gasEstimate: gasEstimate.toString(),
                gasPrice: gasPrice.gasPrice?.toString(),
                estimatedCost: ethers.formatEther(
                    gasEstimate * (gasPrice.gasPrice || ethers.getBigInt(0))
                )
            };
        } catch (error) {
            console.error('❌ Failed to estimate gas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if service is properly configured
     * @returns {boolean} - Configuration status
     */
    isConfigured() {
        return !!(this.contractAddress && this.privateKey && this.contract);
    }

    /**
     * Get service status
     * @returns {Object} - Service status
     */
    getStatus() {
        return {
            configured: this.isConfigured(),
            contractAddress: this.contractAddress,
            hasWallet: !!this.wallet,
            hasContract: !!this.contract,
            rpcUrl: this.rpcUrl
        };
    }
}

// Export singleton instance
module.exports = new BlockchainService();
