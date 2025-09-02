const { sequelize } = require('../config/database');

async function addBlockchainFields() {
  try {
    console.log('Adding blockchain fields to games table...');
    
    const queryInterface = sequelize.getQueryInterface();
    
    // Add blockchain integration fields to games table
    await queryInterface.addColumn('games', 'blockchainGameId', {
      type: sequelize.Sequelize.STRING,
      allowNull: true,
      comment: 'Game ID on the blockchain'
    });
    
    await queryInterface.addColumn('games', 'stakeAmount', {
      type: sequelize.Sequelize.DECIMAL(18, 8),
      allowNull: true,
      comment: 'Stake amount in ETH'
    });
    
    await queryInterface.addColumn('games', 'tokenAddress', {
      type: sequelize.Sequelize.STRING(42),
      allowNull: true,
      comment: 'Token contract address'
    });
    
    await queryInterface.addColumn('games', 'player1Address', {
      type: sequelize.Sequelize.STRING(42),
      allowNull: true,
      comment: 'Player 1 wallet address'
    });
    
    await queryInterface.addColumn('games', 'player2Address', {
      type: sequelize.Sequelize.STRING(42),
      allowNull: true,
      comment: 'Player 2 wallet address'
    });
    
    await queryInterface.addColumn('games', 'player1Score', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('games', 'player2Score', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('games', 'winner', {
      type: sequelize.Sequelize.ENUM('player1', 'player2', 'draw'),
      allowNull: true,
      comment: 'Game winner designation'
    });
    
    await queryInterface.addColumn('games', 'finalWinner', {
      type: sequelize.Sequelize.STRING(42),
      allowNull: true,
      comment: 'Winner wallet address from blockchain'
    });
    
    await queryInterface.addColumn('games', 'payout', {
      type: sequelize.Sequelize.DECIMAL(18, 8),
      allowNull: true,
      comment: 'Payout amount in ETH'
    });
    
    await queryInterface.addColumn('games', 'transactionHash', {
      type: sequelize.Sequelize.STRING(66),
      allowNull: true,
      comment: 'Transaction hash for game creation'
    });
    
    await queryInterface.addColumn('games', 'blockchainSubmitted', {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      comment: 'Whether game result has been submitted to blockchain'
    });
    
    await queryInterface.addColumn('games', 'submissionTxHash', {
      type: sequelize.Sequelize.STRING(66),
      allowNull: true,
      comment: 'Transaction hash for result submission'
    });
    
    await queryInterface.addColumn('games', 'submissionBlockNumber', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      comment: 'Block number where result was submitted'
    });
    
    await queryInterface.addColumn('games', 'submissionAttempts', {
      type: sequelize.Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Number of submission attempts'
    });
    
    await queryInterface.addColumn('games', 'submissionFailed', {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      comment: 'Whether submission permanently failed'
    });
    
    await queryInterface.addColumn('games', 'lastSubmissionError', {
      type: sequelize.Sequelize.TEXT,
      allowNull: true,
      comment: 'Last submission error message'
    });
    
    await queryInterface.addColumn('games', 'createdBy', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      comment: 'User ID who created the game'
    });
    
    console.log('✅ Successfully added blockchain fields to games table');
    
  } catch (error) {
    console.error('❌ Error adding blockchain fields:', error);
    throw error;
  }
}

// Run the migration if called directly
if (require.main === module) {
  addBlockchainFields()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addBlockchainFields;
