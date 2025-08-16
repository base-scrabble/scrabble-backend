# Scrabble Backend Setup Guide

## Prerequisites
- Node.js 18+ installed
- MySQL 8.0+ (for database functionality)

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup Options

#### Option A: Install MySQL Locally (Recommended)

**Windows:**
```bash
# Download and install from: https://dev.mysql.com/downloads/installer/
# Or use Chocolatey:
choco install mysql

# Start MySQL service
net start mysql80
# Or through Services app: services.msc

# Create database
mysql -u root -p
CREATE DATABASE scrabble_db;
exit
```

**macOS:**
```bash
# Install using Homebrew:
brew install mysql

# Or download from: https://dev.mysql.com/downloads/mysql/

# Start MySQL service
brew services start mysql
# Or manually:
sudo /usr/local/mysql/support-files/mysql.server start

# Create database
mysql -u root -p
CREATE DATABASE scrabble_db;
exit
```

**Linux (Ubuntu/Debian):**
```bash
# Install MySQL
sudo apt update
sudo apt install mysql-server

# Start MySQL service
sudo systemctl start mysql
sudo systemctl enable mysql

# Secure installation (optional but recommended)
sudo mysql_secure_installation

# Create database
sudo mysql -u root -p
CREATE DATABASE scrabble_db;
exit
```

**Linux (CentOS/RHEL/Fedora):**
```bash
# Install MySQL
sudo dnf install mysql-server  # Fedora
# OR
sudo yum install mysql-server  # CentOS/RHEL

# Start MySQL service
sudo systemctl start mysqld
sudo systemctl enable mysqld

# Create database
mysql -u root -p
CREATE DATABASE scrabble_db;
exit
```

#### Option B: Use Remote MySQL Database
Update `.env` file with your remote database credentials:
```
DB_HOST=your-remote-host
DB_PORT=3306
DB_NAME=scrabble_db
DB_USER=your-username
DB_PASSWORD=your-password
```

#### Option C: Use Docker (Cross-Platform)
```bash
# Run MySQL in Docker container
docker run --name scrabble-mysql \
  -e MYSQL_ROOT_PASSWORD=scrabblebackend2025db \
  -e MYSQL_DATABASE=scrabble_db \
  -p 3306:3306 \
  -d mysql:8.0

# Verify container is running
docker ps
```

### 3. Run Database Migration & Seeding
```bash
npm run migrate  # Creates tables
npm run seed     # Adds sample data
```

### 4. Start the Server
```bash
npm start
```

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

### Games
- `GET /api/games` - Get all games
- `POST /api/games` - Create new game
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
# Check if MySQL service is running
sc query mysql80
# Start MySQL service if stopped
net start mysql80
# Check credentials in .env file
# Verify database exists: mysql -u root -p -e "SHOW DATABASES;"
```

**macOS:**
```bash
# Check if MySQL is running
brew services list | grep mysql
# Start MySQL if stopped
brew services start mysql
# Check credentials in .env file
# Verify database exists: mysql -u root -p -e "SHOW DATABASES;"
```

**Linux:**
```bash
# Check if MySQL service is running
sudo systemctl status mysql  # Ubuntu/Debian
sudo systemctl status mysqld # CentOS/RHEL/Fedora
# Start MySQL if stopped
sudo systemctl start mysql   # Ubuntu/Debian
sudo systemctl start mysqld  # CentOS/RHEL/Fedora
# Check credentials in .env file
# Verify database exists: mysql -u root -p -e "SHOW DATABASES;"
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
