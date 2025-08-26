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
- **Blockchain Integration** with smart contract support
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
- **Smart Contracts** - Tournament winner verification
- **Web3 Integration** - Decentralized game results

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
WALLET_PRIVATE_KEY=0x...
RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID
CHAIN_ID=1

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
## Blockchain Setup & Smart Contract Deployment

### Prerequisites
- Node.js Version 18+ is recommended
- Ethereum wallet with private key
- RPC endpoint (Infura, Alchemy, or local node)
- Smart contract deployed on target blockchain

### Smart Contract Deployment

1. **Deploy Smart Contract**
   - Use Hardhat, Truffle, or Remix to deploy the tournament verification contract
   - Note the deployed contract address
   - Ensure the contract has methods for:
     - `reportTournamentWinner(uint256 tournamentId, address winner)`
     - `reportGameWinner(uint256 gameId, address winner)`
     - `getTournamentWinner(uint256 tournamentId) returns (address)`

2. **Configure Environment Variables**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your blockchain configuration
   SMART_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
   WALLET_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
   RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID
   CHAIN_ID=1  # 1 for Ethereum mainnet, 137 for Polygon, etc.
   ```

3. **Test Blockchain Connection**
   ```bash
   # Check blockchain service status
   curl http://localhost:3000/api/blockchain/status
   
   # Estimate gas costs
   curl http://localhost:3000/api/blockchain/gas-estimate
   ```

### Supported Networks
- **Ethereum Mainnet** (Chain ID: 1)
- **Polygon** (Chain ID: 137)
- **Binance Smart Chain** (Chain ID: 56)
- **Arbitrum** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Local Development** (Chain ID: 1337)

### Security Considerations
- Never commit private keys to version control
- Use environment variables for all sensitive data
- Consider using a hardware wallet for production
- Implement proper gas limit and price controls
- Monitor contract interactions for anomalies

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