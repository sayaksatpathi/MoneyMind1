# MoneyMind

A modern, responsive personal finance tracker (SPA) with authentication, budgeting, goals, analytics, calendar, receipt uploads, and export features – built with vanilla JavaScript, Firebase, Chart.js, FullCalendar, and jsPDF.

## Live Demo
https://sayaksatpathi.github.io/MoneyMind1/

## Features
- Email + Google authentication (Firebase Auth)
- Accounts & balances (multi-account support)
- Transactions (income, expense, transfer) with filtering & pagination
- Categories management & budget progress indicators
- Recurring transactions processing
- Financial goals with progress tracking
- Dashboard KPIs & recent activity
- Interactive calendar of transactions (FullCalendar)
- Analytics: expense distribution (pie) & income vs expense trends (bar) via Chart.js
- AI-style textual financial summary (rule‑based placeholder)
- Receipt image upload & association (Firebase Storage)
- Data export: CSV + PDF (jsPDF + autotable)
- Dark / Light theme toggle (CSS variables)
- Responsive glassmorphism UI

## Tech Stack
- Frontend: HTML5, CSS3, ES6 Modules (no framework)
- Backend (BaaS): Firebase (Auth, Firestore, Storage)
- Visualization: Chart.js, FullCalendar
- Documents: jsPDF, jspdf-autotable
- Hosting: GitHub Pages

## Architecture
Single-page application controlled by a central `App` object (modules: State, DB, Auth, Logic, UI). Firestore stores a single user document per UID containing arrays for accounts, transactions, categories, goals, recurringTransactions, and settings. Real-time snapshot listener keeps UI in sync.

## Data Model (per user document)
```
{
  accounts: [{ id, name, type, balance, institution, createdAt }],
  transactions: [{ id, type, amount, accountId, categoryId, date, note, transferAccountId, receiptUrl, createdAt }],
  categories: [{ id, name, type, budget, color }],
  goals: [{ id, name, targetAmount, currentAmount, deadline, createdAt }],
  recurringTransactions: [{ id, baseTransaction, frequency, nextRun }],
  settings: { theme, defaultCurrency, defaultAccount }
}
```

## Getting Started
### 1. Clone
```
git clone https://github.com/sayaksatpathi/MoneyMind1.git
cd MoneyMind1
```
### 2. Firebase Setup
1. Create a Firebase project.
2. Enable Authentication (Email/Password + Google provider).
3. Create Cloud Firestore (in production or test mode) & set proper security rules.
4. Enable Storage (optional: create a receipts folder).
5. Register a Web App (</>) and copy the config object.
6. In `index.html`, replace the placeholder firebase config with your values.
7. (Optional) Add `measurementId` if using Analytics.

### 3. (Optional) Local Dev Server
Use any static server (examples):
```
python3 -m http.server 5173
# or
npx serve .
```
Then browse to http://localhost:5173 (or served port).

### 4. Deploy (GitHub Pages)
Already enabled. Push changes to `master` to update. Pages URL: https://sayaksatpathi.github.io/MoneyMind1/

## Firebase Security (Example Rules)
Adjust to production needs:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
Storage (simplistic):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /receipts/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Scripts / Tooling
No build step required. All dependencies via CDN. For production hardening you could later:
- Bundle & minify (esbuild / Rollup / Vite)
- Add linting (ESLint) & Prettier
- Add unit tests (Vitest / Jest) for logic modules

## Roadmap Ideas
- Offline caching / PWA
- Currency conversion & multi-currency accounts
- Budget alerts & email notifications
- Improved AI insights via a backend function
- Sharing or household accounts
- Advanced reporting date ranges

## Contributing
Fork, create a feature branch, submit PR. Keep commits focused.

## License
(Choose a license: MIT recommended. Add LICENSE file.)

## Disclaimer
Educational / personal use example. Validate financial calculations independently.

---
MoneyMind © 2025
