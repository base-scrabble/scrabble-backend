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

# JWT Secret (for future authentication)
JWT_SECRET=your-secret-key-here

# CORS Origins
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
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

## Troubleshooting

Common issues and solutions are documented in [SETUP.md](SETUP.md) for each platform.

-------------------------------------
Notes

Node.js: Version 18+ is recommended.

Base chain: Configuration is required for production deployment.

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