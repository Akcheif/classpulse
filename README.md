# ClassPulse – Intelligent Feedback Management System

## Run on your computer
1. Install Node.js (LTS) from https://nodejs.org
2. Open a terminal in this folder and run:  `node server.js`
3. Open http://localhost:3000
(No `npm install` needed – the app has zero dependencies.)

Demo accounts: CR 1234 / 1111, CR 5678 / 2222, Principal password 3333.
Passwords are stored hashed in `data/db.json` (the database file). To add/change accounts, edit the seed list in `server.js`, delete `data/` and restart.

## Let anyone use it (free hosting on Render.com)
1. Upload this folder to a GitHub repository.
2. On render.com: New → Web Service → connect the repo.
3. Build command: (leave empty). Start command: `node server.js`
4. Add a Disk (mount path `/var/data`) and set environment variable `DB_FILE=/var/data/db.json` so complaints survive restarts (free instances without a disk lose data on redeploy).
5. Render gives you a public https link – share it.

## Files
- server.js – backend API + database logic
- public/index.html – the app screens
- data/db.json – created on first run (users + complaints)
