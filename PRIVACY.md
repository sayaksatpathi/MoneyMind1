# Privacy Notice

MoneyMind respects your privacy. This project stores user financial data in your own Firebase project that you control.

## Data Collected
- Auth info: email, display name, UID (Firebase Auth)
- User-entered finance data: accounts, transactions, categories, goals, recurring transactions, settings
- Optional uploaded files (e.g., receipts) in Firebase Storage
- Anonymous / aggregate usage events (if Google/Firebase Analytics enabled)

## Use of Data
- Provide core app functionality (balances, budgets, charts, calendar, exports)
- Improve UX via aggregate analytics (feature usage) when analytics is enabled

## Your Control
- Delete data via Reset All Data (removes arrays in your user document)
- Delete account in Firebase Auth console
- Disable analytics by removing GA snippet & measurementId

## Storage Location
- Google Cloud (region per your Firebase project settings)

## Security
- Protected by your Firestore & Storage security rules (configure least privilege)
- Recommend enabling MFA for Firebase Auth if available

## Third Parties
- Firebase (Auth, Firestore, Storage, Analytics)
- Google Analytics (optional)
- CDN libraries (Chart.js, FullCalendar, jsPDF, Font Awesome)

## Sensitive Data
Do NOT store banking passwords or highly sensitive personal data. Project intended for general personal finance tracking only.

## Compliance
You are responsible for legal compliance (GDPR/CCPA/etc.) in your deployment. Add cookie consent / opt-out where required.

## Disclaimer
Open-source project provided "AS IS" without warranties.

## Contact
Open an issue in the repository for questions.
