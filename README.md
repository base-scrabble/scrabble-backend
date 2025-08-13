# Based Scrabble Backend

## Setup

1. **Clone the repository**

   git clone <repo-url>
   cd scrabble-backend

2. Install dependencies

npm install

This will generate/update package-lock.json for your environment.

3. Environment variables

Copy .env.example to .env

Update the variables inside .env with your local or production values.

4. Start the development server

npm start

or, if available:

npm run dev


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