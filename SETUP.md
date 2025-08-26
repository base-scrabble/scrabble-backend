# Scrabble Backend Setup Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL 12+ (for database functionality)
- Ethereum wallet with private key (for blockchain integration)
- RPC endpoint access (Infura, Alchemy, or local node)

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env  # or use your preferred editor
```

**Required Environment Variables:**
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scrabble_db
DB_USER=postgres
DB_PASSWORD=your-password

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here

# Blockchain Configuration (Required for tournament winner verification)
SMART_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
WALLET_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID
CHAIN_ID=1

# Admin Configuration
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-admin-password
```

### 3. Database Setup Options

#### Option A: Install PostgreSQL Locally (Recommended)

**Windows:**
```bash
# Download and install from: https://www.postgresql.org/download/windows/
# Or use Chocolatey:
choco install postgresql

# Start PostgreSQL service
net start postgresql-x64-15
# Or through Services app: services.msc

# Create database
psql -U postgres
CREATE DATABASE scrabble_db;
\q
```

**macOS:**
```bash
# Install using Homebrew:
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15
# Or manually:
pg_ctl -D /usr/local/var/postgres start

# Create database
psql -U postgres
CREATE DATABASE scrabble_db;
\q
```

**Linux (Ubuntu/Debian):**
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE scrabble_db;
\q
```

**Linux (CentOS/RHEL/Fedora):**
```bash
# Install PostgreSQL
sudo dnf install postgresql postgresql-server  # Fedora
# OR
sudo yum install postgresql postgresql-server  # CentOS/RHEL

# Initialize and start PostgreSQL
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE scrabble_db;
\q
```

#### Option B: Use Remote PostgreSQL Database
Update `.env` file with your remote database credentials:
```
DB_HOST=your-remote-host
DB_PORT=5432
DB_NAME=scrabble_db
DB_USER=your-username
DB_PASSWORD=your-password
```

#### Option C: Use Docker (Cross-Platform)
```bash
# Run PostgreSQL in Docker container
docker run --name scrabble-postgres \
  -e POSTGRES_PASSWORD=scrabblebackend2025db \
  -e POSTGRES_DB=scrabble_db \
  -p 5432:5432 \
  -d postgres:15

# Verify container is running
docker ps
```

### 4. Database Migration & Seeding

```bash
# Run database migrations
npm run migrate

# Seed database with sample data
npm run seed

# Create admin user
npm run seed:admin

# Or run all setup steps at once
npm run setup
```

### 5. Verify Blockchain Integration

```bash
# Start the server
npm start

# Test blockchain connection
curl http://localhost:3000/api/blockchain/status

# Should return:
# {
#   "success": true,
#   "configured": true,
#   "network": "mainnet",
#   "chainId": 1
# }
```

### 6. Access Admin Panel

1. Navigate to `http://localhost:3000/admin.html`
2. Login with admin credentials from your `.env` file
3. Test tournament creation and blockchain integration

## Blockchain Network Configuration

### Supported Networks

**Ethereum Mainnet:**
```env
RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID
CHAIN_ID=1
```

**Polygon:**
```env
RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR-PROJECT-ID
CHAIN_ID=137
```

**Binance Smart Chain:**
```env
RPC_URL=https://bsc-dataseed.binance.org/
CHAIN_ID=56
```

**Local Development (Hardhat):**
```env
RPC_URL=http://localhost:8545
CHAIN_ID=1337
```

### Security Best Practices

1. **Never commit private keys to version control**
2. **Use environment variables for all sensitive data**
3. **Test on testnets before mainnet deployment**
4. **Monitor gas prices and set appropriate limits**
5. **Implement proper error handling for blockchain calls**
6. **Use hardware wallets for production deployments**

## Troubleshooting Blockchain Issues

**Connection Failed:**
- Verify RPC URL is correct and accessible
- Check network connectivity
- Ensure wallet has sufficient balance for gas

**Transaction Failed:**
- Check gas limit and gas price settings
- Verify contract address is correct
- Ensure wallet has sufficient ETH for gas fees

**Contract Interaction Failed:**
- Verify contract ABI matches deployed contract
- Check if contract methods exist
- Ensure proper permissions on contract methods

## Available Scripts

- `npm start` - Start the server
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with sample data
- `npm run setup` - Run migration and seeding together

## API Endpoints

### Health & Status
- `GET /` - API status
- `GET /api/health` - Health check

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
  ```json
  {
    "username": "string (required, unique)",
    "email": "string (required, unique, valid email)",
    "password": "string (required)"
  }
  ```
  **Example:**
  ```bash
  curl -X POST http://localhost:3000/api/users \
    -H "Content-Type: application/json" \
    -d '{
      "username": "newplayer",
      "email": "newplayer@example.com",
      "password": "securepassword123"
    }'
  ```

### Games
- `GET /api/games` - Get all games
- `POST /api/games` - Create new game
  ```json
  {
    "maxPlayers": "number (optional, default: 4, range: 2-4)"
  }
  ```
  **Example:**
  ```bash
  curl -X POST http://localhost:3000/api/games \
    -H "Content-Type: application/json" \
    -d '{
      "maxPlayers": 2
    }'
  ```
- `GET /api/games/:id` - Get game details

### Statistics
- `GET /api/stats` - Get game statistics

## Frontend Dashboard

Visit `http://localhost:3000` to access the web dashboard with:
- Real-time statistics
- User management
- Game management
- Database connectivity status

## Troubleshooting

### Database Connection Issues

**Windows:**
```bash
# Check if PostgreSQL service is running
sc query postgresql-x64-15
# Start PostgreSQL service if stopped
net start postgresql-x64-15
# Check credentials in .env file
# Verify database exists: psql -U postgres -l
```

**macOS:**
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql
# Start PostgreSQL if stopped
brew services start postgresql@15
# Check credentials in .env file
# Verify database exists: psql -U postgres -l
```

**Linux:**
```bash
# Check if PostgreSQL service is running
sudo systemctl status postgresql
# Start PostgreSQL if stopped
sudo systemctl start postgresql
# Check credentials in .env file
# Verify database exists: sudo -u postgres psql -l
```

### Server Won't Start

**Windows:**
```bash
# Check if port 3000 is available
netstat -an | findstr :3000
# Kill existing Node.js processes
taskkill /f /im node.exe
# Check Node.js version
node --version
```

**macOS/Linux:**
```bash
# Check if port 3000 is available
lsof -i :3000          # macOS
netstat -tlnp | grep :3000  # Linux
# Kill existing processes
pkill -f "node server.js"
# Check Node.js version
node --version
```

### Common Issues

1. **Port already in use**: Change PORT in `.env` file or kill existing process
2. **MySQL connection refused**: Ensure MySQL service is running
3. **Permission denied**: Run with appropriate permissions or check file ownership
4. **Module not found**: Run `npm install` to install dependencies

## Project Structure
```
scrabble-backend/
├── config/
│   └── database.js         # Database configuration
├── models/
│   ├── User.js            # User model
│   ├── Game.js            # Game model
│   ├── GamePlayer.js      # Game player model
│   ├── Move.js            # Move model
│   └── index.js           # Model associations
├── public/
│   ├── index.html         # Frontend dashboard
│   └── app.js             # Frontend JavaScript
├── scripts/
│   ├── migrate.js         # Database migration
│   └── seed.js            # Database seeding
├── .env                   # Environment variables
├── server.js              # Main server file
└── package.json           # Dependencies & scripts
```
