# Scrabble Backend

A Node.js/Express backend API for a multiplayer Scrabble game with PostgreSQL database integration, real-time gameplay, JWT authentication, and comprehensive word validation.

## Features

- **RESTful API** for game management
- **PostgreSQL Database** with Sequelize ORM
- **Real-time Gameplay** with Socket.IO
- **JWT Authentication** with bcrypt password hashing
- **Word Validation** with comprehensive Scrabble dictionary
- **File Upload Support** for user avatars (Multer)
- **Real-time Dashboard** with statistics and management
- **Cross-platform Setup** (Windows, macOS, Linux)
- **Docker Support** for easy deployment
- **Database Migrations & Seeding**
- **Blockchain Integration** with EIP-712 signatures and backend-signer pattern
- **Tournament Management** with bracket generation
- **Admin Panel** for comprehensive system management

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Database** (see [SETUP.md](SETUP.md) for platform-specific instructions)

3. **Run Migrations & Seed Data**
   ```bash
   npm run setup
   ```

4. **Start Server**
   ```bash
   npm start
   ```

5. **Access Dashboard**
   Open http://localhost:3000 in your browser

## Tech Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework for RESTful APIs
- **PostgreSQL** - Primary database
- **Sequelize** - ORM for database operations

### Authentication & Security
- **JWT (JSON Web Tokens)** - Stateless authentication
- **Bcrypt** - Password hashing and verification

### Real-time Features
- **Socket.IO** - Real-time bidirectional communication
- **WebSocket** - Live gameplay and chat

### File Handling
- **Multer** - File upload middleware for avatars

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Vitest** - Testing framework

### Blockchain Integration
- **Ethers.js** - Ethereum blockchain interaction
- **EIP-712 Signatures** - Structured off-chain signing
- **Backend-Signer Pattern** - Secure transaction validation
- **Smart Contracts** - Game settlement and winner verification
- **Event Listeners** - Real-time blockchain state synchronization
- **Automated Submission** - Background game result reporting

## API Endpoints

### Health & Status
- `GET /` - API status and info
- `GET /api/health` - Health check with database status

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile (protected)
- `PUT /api/auth/profile` - Update user profile (protected)
- `POST /api/auth/change-password` - Change password (protected)

### Word Validation
- `GET /api/words/validate/:word` - Validate single word
- `POST /api/words/validate` - Validate multiple words
- `GET /api/words/search?pattern=` - Search words by pattern
- `GET /api/words/stats` - Dictionary statistics

### Users
- `GET /api/users` - List all players
- `POST /api/users` - Create new player

### Games  
- `GET /api/games` - List all games
- `POST /api/games` - Create new game
- `GET /api/games/:id` - Get game details

### Statistics
- `GET /api/stats` - Game statistics dashboard

### Admin Panel
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET /api/admin/tournaments` - List tournaments
- `POST /api/admin/tournaments` - Create tournament
- `PUT /api/admin/tournaments/:id` - Update tournament
- `DELETE /api/admin/tournaments/:id` - Delete tournament
- `POST /api/admin/tournaments/:id/generate-bracket` - Generate tournament bracket
- `GET /api/admin/schedules` - List tournament schedules
- `POST /api/admin/schedules` - Create schedule
- `PUT /api/admin/schedules/:id` - Update schedule
- `DELETE /api/admin/schedules/:id` - Delete schedule
- `GET /api/admin/users` - List users with admin view

### Blockchain Integration
- `POST /api/blockchain/report-tournament-winner` - Report tournament winner to blockchain
- `POST /api/blockchain/report-game-winner` - Report game winner to blockchain
- `GET /api/blockchain/tournament-winner/:tournamentId` - Get tournament winner from blockchain
- `GET /api/blockchain/status` - Check blockchain service status
- `GET /api/blockchain/gas-estimate` - Estimate gas costs

### Backend-Signer Pattern (EIP-712 Signatures)
- `POST /api/auth/deposit-signature` - Generate backend signature for ETH deposits
- `POST /api/auth/withdraw-signature` - Generate backend signature for ETH withdrawals
- `POST /api/game/create-signature` - Generate backend signature for game creation
- `POST /api/game/join-signature` - Generate backend signature for joining games
- `POST /api/game/cancel-signature` - Generate backend signature for game cancellation

## Environment Variables

Create a `.env` file with:

```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=scrabble_db
DB_USER=root
DB_PASSWORD=your-password

# JWT Secret
JWT_SECRET=your-secret-key-here

# CORS Origins
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Blockchain Configuration
SMART_CONTRACT_ADDRESS=0x...
SCRABBLE_CONTRACT_ADDRESS=0x...
WALLET_PRIVATE_KEY=0x...
BACKEND_SIGNER_PRIVATE_KEY=0x...
SUBMITTER_PRIVATE_KEY=0x...
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453

# Stake Amount Limits
MIN_STAKE_AMOUNT=0.001
MAX_STAKE_AMOUNT=10

# Payment Gateway (Busha)
BUSHA_API_KEY=your-busha-api-key
BUSHA_SECRET_KEY=your-busha-secret-key
BUSHA_WEBHOOK_SECRET=your-busha-webhook-secret

# Admin Configuration
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-admin-password
```

## Scripts

- `npm start` - Start the server
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with sample data
- `npm run setup` - Run migration and seeding together
- `node scripts/addBlockchainFields.js` - Add blockchain fields to existing database

## Database Models

- **User** - Player accounts and statistics
- **Game** - Game sessions and state
- **GamePlayer** - Player participation in games
- **Move** - Individual game moves and scoring
- **Tournament** - Tournament management and configuration
- **TournamentPlayer** - Player participation in tournaments
- **TournamentMatch** - Tournament bracket matches
- **TournamentSchedule** - Automated tournament scheduling
- **Admin** - Admin user management and permissions

## Cross-Platform Setup

See [SETUP.md](SETUP.md) for detailed setup instructions for:
- Windows (PostgreSQL Installer, Chocolatey)
- macOS (Homebrew, PostgreSQL Installer)
- Linux (apt, dnf, yum)
- Docker (Cross-platform)

## Development

The server runs in development mode with:
- Database connection testing
- Automatic model loading
- Error handling and logging
- CORS enabled for frontend development

## Team Collaboration

This project is designed to work across different operating systems. Team members can use their preferred development environment while maintaining consistency through:

- Cross-platform documentation
- Environment-based configuration
- Docker containerization option
- Standardized npm scripts

## Admin Panel Access

### Initial Admin Setup
1. **Create Admin User**
   ```bash
   npm run seed:admin
   ```
   This creates an admin user with credentials from your `.env` file.

2. **Access Admin Panel**
   - Navigate to `http://localhost:3000/admin.html`
   - Login with admin credentials
   - Default: admin@example.com / secure-admin-password

### Admin Features
- **Tournament Management**: Create, edit, delete tournaments
- **Bracket Generation**: Automatic tournament bracket creation
- **Schedule Management**: Automated tournament scheduling
- **User Management**: View and manage player accounts
- **Blockchain Integration**: Report winners to smart contracts
- **System Settings**: Configure game rules and parameters

## Troubleshooting

### Common Issues
- **Database Connection**: Ensure PostgreSQL is running and credentials are correct
- **Blockchain Connection**: Verify RPC URL and network connectivity
- **Smart Contract**: Confirm contract address and ABI compatibility
- **Admin Access**: Run `npm run seed:admin` if admin login fails

Detailed platform-specific solutions are documented in [SETUP.md](SETUP.md).

-------------------------------------
## Blockchain Integration & Backend-Signer Pattern

### Overview
The backend implements a secure **backend-signer pattern** using **EIP-712 signatures** for blockchain transactions. This approach provides:
- **Enhanced Security**: Backend validation before signing
- **User Control**: Users maintain wallet custody
- **Gas Optimization**: Reduced transaction costs
- **Fraud Prevention**: Nonce management and replay protection

### Architecture Components

#### 1. Signature Services
- **`signatureService.js`** - EIP-712 signature generation
- **`nonceService.js`** - Nonce management and synchronization
- **Backend Signer** - Validates and co-signs transactions
- **Submitter Service** - Automated game result submission

#### 2. Event Listeners
- **`blockchainListener.js`** - Real-time blockchain event monitoring
- **Wallet Contract Events**: Deposits, withdrawals, game lifecycle
- **Scrabble Contract Events**: Game settlements and scoring
- **Database Synchronization**: Automatic state updates

#### 3. API Endpoints
- **Deposit/Withdraw Signatures**: `/api/auth/deposit-signature`, `/api/auth/withdraw-signature`
- **Game Signatures**: `/api/game/create-signature`, `/api/game/join-signature`, `/api/game/cancel-signature`
- **Validation**: KYC status, stake limits, game state verification

### Setup Instructions

#### 1. Database Migration
```bash
# Add blockchain fields to existing database
node scripts/addBlockchainFields.js
```

#### 2. Environment Configuration
```bash
# Copy and configure environment file
cp .env.example .env
```

Required variables:
```env
# Smart Contract Addresses
SMART_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
SCRABBLE_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890

# Private Keys (Keep Secure!)
BACKEND_SIGNER_PRIVATE_KEY=0xabcdef...
SUBMITTER_PRIVATE_KEY=0xabcdef...

# Network Configuration
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453

# Game Configuration
MIN_STAKE_AMOUNT=0.001
MAX_STAKE_AMOUNT=10
```

#### 3. Smart Contract Requirements
Ensure your contracts implement:

**Wallet Contract:**
- `deposit(address token, uint256 amount, bytes signature)`
- `withdraw(address token, uint256 amount, bytes signature)`
- `createGame(uint256 stake, bytes signature)`
- `joinGame(uint256 gameId, bytes signature)`

**Scrabble Contract:**
- `submitResult(uint256 gameId, address winner, uint256 player1Score, uint256 player2Score)`

#### 4. Testing Blockchain Integration
```bash
# Start the server
npm start

# Check blockchain service status
curl http://localhost:3000/api/blockchain/status

# Test signature generation (requires authentication)
curl -X POST http://localhost:3000/api/auth/deposit-signature \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userAddress":"0x...","amount":"0.1"}'
```

### Supported Networks
- **Base Mainnet** (Chain ID: 8453) - Recommended
- **Ethereum Mainnet** (Chain ID: 1)
- **Polygon** (Chain ID: 137)
- **Arbitrum** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Local Development** (Chain ID: 1337)

### Security Features
- **EIP-712 Structured Signing** - Prevents signature malleability
- **Nonce Management** - Prevents replay attacks
- **Backend Validation** - KYC, balance, and state checks
- **Separate Key Management** - Different keys for signing and submission
- **Automatic Monitoring** - Real-time event synchronization

### Production Considerations
- Use hardware wallets or secure key management systems
- Implement proper monitoring and alerting
- Set up backup RPC endpoints for redundancy
- Monitor gas prices and implement dynamic fee adjustment
- Regular security audits of smart contracts and backend code

Notes

Lockfile (package-lock.json):
Always commit updated package-lock.json after running npm install:

git add package-lock.json
git commit -m "Update package-lock.json after npm install"
git push origin main

node_modules: Ignored via .gitignore — do not commit this folder.

Git remote check: Before your first push, run:

git remote -v

to confirm you are pushing to the correct repository.

This repository was freshly created and initialized — no prior backend work exists yet.


---------------------------
Local Development Shortcuts

We added helper npm scripts so you can run common tasks quickly:

Start in dev mode (auto-reload on changes):

npm run dev

Lint the code:

npm run lint

Format the code:

npm run format


These scripts are defined in package.json and are optional, but make local development faster and cleaner.