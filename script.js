import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js';
import {
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js';
import {
    ref,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js';

(function() {
    'use strict';

    const App = {
        // --- STATE MANAGEMENT ---
        State: {
            user: null,
            userData: null,
            unsubscribe: null,
            lastTransactionDoc: null,
            isFetchingTransactions: false,
            charts: {},
            calendar: null,
        },

        // --- DATABASE (FIRESTORE & STORAGE) ---
        DB: {
            getUserDocRef: () => doc(window.db, "users", App.State.user.uid),

            async createUserData(user, name, isStudent) {
                const defaultData = App.Logic.getDefaultUserData(isStudent);
                await setDoc(App.DB.getUserDocRef(), {
                    ...defaultData,
                    uid: user.uid,
                    email: user.email,
                    name: name,
                    createdAt: new Date().toISOString(),
                });
            },

            async updateUserData(data) {
                if (!App.State.user) return;
                try {
                    await updateDoc(App.DB.getUserDocRef(), data);
                    App.UI.showToast('Success', 'Your data has been updated.', 'success');
                } catch (error) {
                    console.error("Error updating user data:", error);
                    App.UI.showToast('Error', 'Could not update data.', 'error');
                }
            },

            listenForUserData() {
                if (App.State.unsubscribe) App.State.unsubscribe();
                App.State.unsubscribe = onSnapshot(App.DB.getUserDocRef(), (doc) => {
                    if (doc.exists()) {
                        App.State.userData = doc.data();
                        App.Logic.processRecurringTransactions();
                        App.UI.renderAll();
                    } else {
                        console.log("No such document!");
                    }
                    App.UI.hideLoading();
                }, (error) => {
                    console.error("Error listening to user data:", error);
                    App.UI.showToast('Error', 'Could not connect to the database.', 'error');
                    App.UI.hideLoading();
                });
            },

            async uploadReceipt(file) {
                if (!App.State.user || !file) return null;
                const filePath = `receipts/${App.State.user.uid}/${Date.now()}-${file.name}`;
                const fileRef = ref(window.storage, filePath);
                try {
                    const snapshot = await uploadBytes(fileRef, file);
                    const url = await getDownloadURL(snapshot.ref);
                    return {
                        url,
                        path: filePath
                    };
                } catch (error) {
                    console.error("Error uploading file:", error);
                    App.UI.showToast('Error', 'Failed to upload receipt.', 'error');
                    return null;
                }
            }
        },

        // --- AUTHENTICATION ---
        Auth: {
            async register(name, email, password, isStudent) {
                try {
                    App.UI.showLoading();
                    const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
                    await App.DB.createUserData(userCredential.user, name, isStudent);
                    App.Analytics.track('sign_up', { method: 'password' });
                    App.UI.closeModal('authModal');
                } catch (error) {
                    App.UI.showToast('Registration Failed', App.Logic.formatFirebaseError(error.message), 'error');
                } finally {
                    App.UI.hideLoading();
                }
            },

            async login(email, password) {
                try {
                    App.UI.showLoading();
                    await signInWithEmailAndPassword(window.auth, email, password);
                    App.Analytics.track('login', { method: 'password' });
                    App.UI.closeModal('authModal');
                } catch (error) {
                    App.UI.showToast('Login Failed', App.Logic.formatFirebaseError(error.message), 'error');
                } finally {
                    App.UI.hideLoading();
                }
            },

            async signInWithGoogle() {
                try {
                    App.UI.showLoading();
                    const provider = new GoogleAuthProvider();
                    const result = await signInWithPopup(window.auth, provider);
                    const user = result.user;
                    const userDoc = await getDoc(doc(window.db, 'users', user.uid));
                    if (!userDoc.exists()) {
                        await App.DB.createUserData(user, user.displayName, false);
                        App.Analytics.track('sign_up', { method: 'google' });
                    } else {
                        App.Analytics.track('login', { method: 'google' });
                    }
                    App.UI.closeModal('authModal');
                } catch (error) {
                    App.UI.showToast('Google Sign-In Failed', App.Logic.formatFirebaseError(error.message), 'error');
                } finally {
                    App.UI.hideLoading();
                }
            },

            async logout() {
                await signOut(window.auth);
                App.Analytics.track('logout');
                if (App.State.unsubscribe) App.State.unsubscribe();
                App.State.user = null;
                App.State.userData = null;
                document.body.classList.remove('logged-in');
                App.UI.showModal('authModal');
            },

            handleAuthStateChange(user) {
                if (user) {
                    App.State.user = user;
                    App.UI.showLoading();
                    App.DB.listenForUserData();
                    document.body.classList.add('logged-in');
                    App.UI.closeModal('authModal');
                } else {
                    App.Auth.logout();
                }
            }
        },

        // --- BUSINESS LOGIC & DATA PROCESSING ---
        Logic: {
            formatCurrency(amount) {
                const currency = App.State.userData?.settings?.defaultCurrency || 'USD';
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency
                }).format(amount);
            },

            formatFirebaseError(msg) {
                return msg.replace('Firebase: ', '').replace(/ *\([^)]*\) */g, "");
            },

            validatePassword(password) {
                return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
            },

            generateId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2);
            },

            getDefaultUserData(isStudent) {
                const studentCategories = [{
                    id: 'cat_student_loan',
                    name: 'Student Loan',
                    icon: 'fa-graduation-cap',
                    budget: 300
                }, {
                    id: 'cat_scholarship',
                    name: 'Scholarship',
                    icon: 'fa-award',
                    budget: 0
                }, {
                    id: 'cat_textbooks',
                    name: 'Textbooks',
                    icon: 'fa-book',
                    budget: 200
                }, ];

                const defaultCategories = [{
                    id: 'cat_salary',
                    name: 'Salary',
                    icon: 'fa-briefcase',
                    budget: 0
                }, {
                    id: 'cat_rent',
                    name: 'Rent',
                    icon: 'fa-home',
                    budget: 1200
                }, {
                    id: 'cat_groceries',
                    name: 'Groceries',
                    icon: 'fa-shopping-cart',
                    budget: 400
                }, {
                    id: 'cat_transport',
                    name: 'Transport',
                    icon: 'fa-car',
                    budget: 150
                }, {
                    id: 'cat_utilities',
                    name: 'Utilities',
                    icon: 'fa-bolt',
                    budget: 200
                }, {
                    id: 'cat_entertainment',
                    name: 'Entertainment',
                    icon: 'fa-film',
                    budget: 100
                }, {
                    id: 'cat_health',
                    name: 'Health',
                    icon: 'fa-heartbeat',
                    budget: 100
                }, {
                    id: 'cat_investments',
                    name: 'Investments',
                    icon: 'fa-chart-line',
                    budget: 300
                }, ];

                return {
                    accounts: [{
                        id: 'acc_cash',
                        name: 'Cash',
                        balance: 0,
                        type: 'cash',
                        icon: 'fa-money-bill-wave'
                    }, {
                        id: 'acc_checking',
                        name: 'Checking Account',
                        balance: 1000,
                        type: 'bank',
                        icon: 'fa-university'
                    }, ],
                    transactions: [],
                    categories: isStudent ? [...defaultCategories, ...studentCategories] : defaultCategories,
                    goals: [],
                    recurringTransactions: [],
                    settings: {
                        defaultCurrency: 'USD',
                        defaultAccount: 'acc_checking',
                        theme: 'dark',
                    },
                };
            },

            calculateDashboardStats() {
                const {
                    transactions,
                    accounts
                } = App.State.userData;
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                const monthlyTransactions = transactions.filter(t => new Date(t.date) >= startOfMonth);

                const monthlyIncome = monthlyTransactions
                    .filter(t => t.type === 'income')
                    .reduce((sum, t) => sum + t.amount, 0);

                const monthlyExpenses = monthlyTransactions
                    .filter(t => t.type === 'expense')
                    .reduce((sum, t) => sum + t.amount, 0);

                const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
                const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;

                return {
                    totalBalance,
                    monthlyIncome,
                    monthlyExpenses,
                    netChange: monthlyIncome - monthlyExpenses,
                    savingsRate: Math.round(savingsRate),
                };
            },

            async processCRUD(type, action, data) {
                App.UI.showLoading();
                const { userData } = App.State;
                let updatedData = { ...userData };
                let analyticsEvent = '';
                switch (type) {
                    case 'transaction':
                        if (action === 'add') {
                            const newTransaction = { ...data, id: App.Logic.generateId() };
                            updatedData.transactions.push(newTransaction);
                            updatedData.accounts = App.Logic.updateAccountBalance(updatedData.accounts, newTransaction);
                        } else if (action === 'update') {
                            const oldTransaction = userData.transactions.find(t => t.id === data.id);
                            updatedData.accounts = App.Logic.updateAccountBalance(updatedData.accounts, oldTransaction, true); // Revert old
                            updatedData.transactions = userData.transactions.map(t => t.id === data.id ? data : t);
                            updatedData.accounts = App.Logic.updateAccountBalance(updatedData.accounts, data); // Apply new
                        } else if (action === 'delete') {
                            const transactionToDelete = userData.transactions.find(t => t.id === data.id);
                            updatedData.transactions = userData.transactions.filter(t => t.id !== data.id);
                            updatedData.accounts = App.Logic.updateAccountBalance(updatedData.accounts, transactionToDelete, true);
                        }
                        analyticsEvent = `transaction_${action}`;
                        break;

                    case 'account':
                        if (action === 'add') {
                            updatedData.accounts.push({ ...data, id: App.Logic.generateId() });
                        } else if (action === 'update') {
                            updatedData.accounts = userData.accounts.map(a => a.id === data.id ? data : a);
                        } else if (action === 'delete') {
                            if (userData.transactions.some(t => t.accountId === data.id)) {
                                App.UI.showToast('Error', 'Cannot delete account with transactions.', 'error');
                                App.UI.hideLoading();
                                return;
                            }
                            updatedData.accounts = userData.accounts.filter(a => a.id !== data.id);
                        }
                        analyticsEvent = `account_${action}`;
                        break;

                    case 'category':
                        if (action === 'add') {
                            updatedData.categories.push({ ...data, id: App.Logic.generateId() });
                        } else if (action === 'update') {
                            updatedData.categories = userData.categories.map(c => c.id === data.id ? data : c);
                        } else if (action === 'delete') {
                            if (userData.transactions.some(t => t.categoryId === data.id)) {
                                App.UI.showToast('Error', 'Cannot delete category with transactions.', 'error');
                                App.UI.hideLoading();
                                return;
                            }
                            updatedData.categories = userData.categories.filter(c => c.id !== data.id);
                        }
                        analyticsEvent = `category_${action}`;
                        break;

                    case 'goal':
                        if (action === 'add') {
                            updatedData.goals.push({ ...data, id: App.Logic.generateId(), currentAmount: 0 });
                        } else if (action === 'update') {
                            updatedData.goals = userData.goals.map(g => g.id === data.id ? { ...g, ...data } : g);
                        } else if (action === 'delete') {
                            updatedData.goals = userData.goals.filter(g => g.id !== data.id);
                        }
                        analyticsEvent = `goal_${action}`;
                        break;
                }

                await App.DB.updateUserData(updatedData);
                if (analyticsEvent) App.Analytics.track(analyticsEvent);
                App.UI.closeModal('formModal');
                App.UI.hideLoading();
            },

            updateAccountBalance(accounts, transaction, revert = false) {
                const multiplier = revert ? -1 : 1;
                return accounts.map(acc => {
                    if (transaction.type === 'transfer') {
                        if (acc.id === transaction.accountId) {
                            return { ...acc, balance: acc.balance - transaction.amount * multiplier };
                        }
                        if (acc.id === transaction.toAccountId) {
                            return { ...acc, balance: acc.balance + transaction.amount * multiplier };
                        }
                    } else {
                        if (acc.id === transaction.accountId) {
                            const amount = transaction.type === 'income' ? transaction.amount : -transaction.amount;
                            return { ...acc, balance: acc.balance + amount * multiplier };
                        }
                    }
                    return acc;
                });
            },

            processRecurringTransactions() {
                const { recurringTransactions = [], transactions } = App.State.userData;
                let newTransactions = [];
                const now = new Date();

                recurringTransactions.forEach(rt => {
                    let nextDueDate = new Date(rt.startDate);
                    const endDate = rt.endDate ? new Date(rt.endDate) : null;

                    while (nextDueDate <= now) {
                        if (endDate && nextDueDate > endDate) break;

                        const transactionExists = transactions.some(t =>
                            t.recurringId === rt.id &&
                            new Date(t.date).toDateString() === nextDueDate.toDateString()
                        );

                        if (!transactionExists) {
                            newTransactions.push({
                                ...rt,
                                id: App.Logic.generateId(),
                                recurringId: rt.id,
                                date: nextDueDate.toISOString().split('T')[0],
                            });
                        }

                        switch (rt.frequency) {
                            case 'daily':
                                nextDueDate.setDate(nextDueDate.getDate() + 1);
                                break;
                            case 'weekly':
                                nextDueDate.setDate(nextDueDate.getDate() + 7);
                                break;
                            case 'monthly':
                                nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                                break;
                        }
                    }
                });

                if (newTransactions.length > 0) {
                    let updatedAccounts = [...App.State.userData.accounts];
                    newTransactions.forEach(t => {
                        updatedAccounts = App.Logic.updateAccountBalance(updatedAccounts, t);
                    });
                    App.DB.updateUserData({
                        transactions: [...transactions, ...newTransactions],
                        accounts: updatedAccounts
                    });
                    App.UI.showToast('Recurring Transactions', `${newTransactions.length} new transaction(s) added.`, 'info');
                }
            },

            getFilteredTransactions() {
                const { transactions } = App.State.userData;
                const dateFrom = document.getElementById('dateFromFilter').value;
                const dateTo = document.getElementById('dateToFilter').value;
                const type = document.getElementById('typeFilter').value;
                const category = document.getElementById('categoryFilter').value;
                const account = document.getElementById('accountFilter').value;

                return transactions.filter(t => {
                    const tDate = new Date(t.date);
                    if (dateFrom && tDate < new Date(dateFrom)) return false;
                    if (dateTo && tDate > new Date(dateTo)) return false;
                    if (type && t.type !== type) return false;
                    if (category && t.categoryId !== category) return false;
                    if (account && t.accountId !== account) return false;
                    return true;
                }).sort((a, b) => new Date(b.date) - new Date(a.date));
            },

            generateAISummary() {
                const {
                    transactions,
                    categories
                } = App.State.userData;
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const recentTransactions = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);

                if (recentTransactions.length < 5) {
                    return "Not enough data for a meaningful summary. Please add more transactions from the last 30 days.";
                }

                const income = recentTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                const expenses = recentTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                const net = income - expenses;

                const expenseByCategory = recentTransactions
                    .filter(t => t.type === 'expense')
                    .reduce((acc, t) => {
                        const categoryName = categories.find(c => c.id === t.categoryId)?.name || 'Uncategorized';
                        acc[categoryName] = (acc[categoryName] || 0) + t.amount;
                        return acc;
                    }, {});

                const topCategory = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];

                let summary = `Here's your financial summary for the last 30 days:\n\n`;
                summary += `• Total Income: ${App.Logic.formatCurrency(income)}\n`;
                summary += `• Total Expenses: ${App.Logic.formatCurrency(expenses)}\n`;
                summary += `• Net Change: ${App.Logic.formatCurrency(net)} (${net >= 0 ? 'Surplus' : 'Deficit'})\n\n`;
                if (topCategory) {
                    summary += `Your top spending category was "${topCategory[0]}" with a total of ${App.Logic.formatCurrency(topCategory[1])}.\n\n`;
                }
                summary += `Keep up the great work tracking your finances!`;

                App.Analytics.track('ai_summary');
                return summary;
            },

            exportToCSV() {
                const transactions = App.Logic.getFilteredTransactions();
                if (transactions.length === 0) {
                    App.UI.showToast('Export Failed', 'No transactions to export.', 'warning');
                    return;
                }

                const headers = ['Date', 'Description', 'Type', 'Amount', 'Category', 'Account', 'Tags'];
                const rows = transactions.map(t => {
                    const category = App.State.userData.categories.find(c => c.id === t.categoryId)?.name || '';
                    const account = App.State.userData.accounts.find(a => a.id === t.accountId)?.name || '';
                    return [
                        t.date,
                        t.description,
                        t.type,
                        t.amount,
                        category,
                        account,
                        t.tags ? t.tags.join(', ') : ''
                    ].join(',');
                });

                const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "moneymind_transactions.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                App.Analytics.track('export_csv', { count: transactions.length });
            },

            exportToPDF() {
                const transactions = App.Logic.getFilteredTransactions();
                if (transactions.length === 0) {
                    App.UI.showToast('Export Failed', 'No transactions to export.', 'warning');
                    return;
                }

                const {
                    jsPDF
                } = window.jspdf;
                const doc = new jsPDF();

                doc.text("MoneyMind Transaction Report", 14, 16);
                doc.setFontSize(10);
                doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

                const head = [
                    ['Date', 'Description', 'Type', 'Amount', 'Category', 'Account']
                ];
                const body = transactions.map(t => [
                    t.date,
                    t.description,
                    t.type,
                    App.Logic.formatCurrency(t.amount),
                    App.State.userData.categories.find(c => c.id === t.categoryId)?.name || '',
                    App.State.userData.accounts.find(a => a.id === t.accountId)?.name || ''
                ]);

                doc.autoTable({
                    startY: 30,
                    head: head,
                    body: body,
                    theme: 'striped',
                    headStyles: {
                        fillColor: [108, 92, 231]
                    },
                });

                doc.save('moneymind_transactions.pdf');

                App.Analytics.track('export_pdf', { count: transactions.length });
            }
        },

        // --- UI & DOM MANIPULATION ---
        UI: {
            renderAll() {
                if (!App.State.userData) return;
                App.UI.renderUserProfile();
                App.UI.renderDashboard();
                App.UI.renderAccounts();
                App.UI.renderTransactions();
                App.UI.renderGoals();
                App.UI.renderReports();
                App.UI.renderSettings();
                App.UI.renderCalendar();
                App.UI.updateFilterOptions();
            },

            renderUserProfile() {
                const {
                    name,
                    email
                } = App.State.userData;
                document.getElementById('userName').textContent = name;
                document.getElementById('userEmail').textContent = email;
                document.getElementById('userInitials').textContent = name ? name.charAt(0).toUpperCase() : 'U';
            },

            renderDashboard() {
                const stats = App.Logic.calculateDashboardStats();
                document.getElementById('totalBalance').textContent = App.Logic.formatCurrency(stats.totalBalance);
                document.getElementById('monthlyIncome').textContent = App.Logic.formatCurrency(stats.monthlyIncome);
                document.getElementById('monthlyExpenses').textContent = App.Logic.formatCurrency(stats.monthlyExpenses);
                document.getElementById('savingsRate').textContent = `${stats.savingsRate}%`;

                // Render budget categories
                const budgetContainer = document.getElementById('budgetCategories');
                budgetContainer.innerHTML = '';
                const expenseCategories = App.State.userData.categories.filter(c => c.budget > 0);
                expenseCategories.forEach(cat => {
                    const spent = App.State.userData.transactions
                        .filter(t => t.categoryId === cat.id && t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth())
                        .reduce((sum, t) => sum + t.amount, 0);
                    const progress = cat.budget > 0 ? (spent / cat.budget) * 100 : 0;

                    const card = document.createElement('div');
                    card.className = 'budget-category';
                    card.innerHTML = `
                        <div class="category-info">
                            <div class="category-icon" style="background-color: ${App.UI.getCategoryColor(cat.id)}"><i class="fas ${cat.icon}"></i></div>
                            <div class="category-details">
                                <h4>${cat.name}</h4>
                                <div class="category-progress">
                                    <div class="progress-bar">
                                        <div class="progress-fill ${progress > 100 ? 'over-budget' : ''}" style="width: ${Math.min(progress, 100)}%;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="category-amount">
                            <div class="spent-amount">${App.Logic.formatCurrency(spent)}</div>
                            <div class="budget-amount">of ${App.Logic.formatCurrency(cat.budget)}</div>
                        </div>
                    `;
                    budgetContainer.appendChild(card);
                });

                // Render recent transactions
                const recentList = document.getElementById('recentTransactionsList');
                recentList.innerHTML = '';
                App.State.userData.transactions
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 5)
                    .forEach(t => recentList.appendChild(App.UI.createTransactionElement(t)));
            },

            renderAccounts() {
                const grid = document.getElementById('accountsGrid');
                grid.innerHTML = '';
                App.State.userData.accounts.forEach(acc => {
                    const card = document.createElement('div');
                    card.className = 'account-card';
                    card.innerHTML = `
                        <div class="account-header">
                            <div class="account-info">
                                <div class="account-icon"><i class="fas ${acc.icon}"></i></div>
                                <div>
                                    <div class="account-name">${acc.name}</div>
                                    <div class="account-type">${acc.type}</div>
                                </div>
                            </div>
                        </div>
                        <div class="account-balance">${App.Logic.formatCurrency(acc.balance)}</div>
                        <div class="account-actions">
                            <button class="action-btn" data-action="edit-account" data-id="${acc.id}"><i class="fas fa-pencil-alt"></i></button>
                            <button class="action-btn danger" data-action="delete-account" data-id="${acc.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            },

            renderTransactions() {
                const list = document.getElementById('transactionsList');
                list.innerHTML = '';
                const filtered = App.Logic.getFilteredTransactions();
                filtered.forEach(t => list.appendChild(App.UI.createTransactionElement(t)));
            },

            createTransactionElement(t) {
                const item = document.createElement('div');
                item.className = 'transaction-item';
                item.dataset.id = t.id;
                const category = App.State.userData.categories.find(c => c.id === t.categoryId);
                const account = App.State.userData.accounts.find(a => a.id === t.accountId);

                item.innerHTML = `
                    <div class="transaction-icon ${t.type}">
                        <i class="fas ${category ? category.icon : 'fa-question-circle'}"></i>
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-description">${t.description}</div>
                        <div class="transaction-meta">
                            <span class="transaction-date">${new Date(t.date).toLocaleDateString()}</span>
                            ${category ? `<span class="transaction-category">${category.name}</span>` : ''}
                            ${account ? `<span class="transaction-account">${account.name}</span>` : ''}
                            ${t.tags && t.tags.length > 0 ? `<div class="transaction-tags">${t.tags.map(tag => `<span class="transaction-tag">${tag}</span>`).join('')}</div>` : ''}
                            ${t.receipt ? `<i class="fas fa-paperclip" title="Receipt attached"></i>` : ''}
                        </div>
                    </div>
                    <div class="transaction-amount ${t.type}">
                        ${t.type === 'income' ? '+' : '-'}${App.Logic.formatCurrency(t.amount)}
                    </div>
                    <div class="transaction-actions">
                        <button class="action-btn" data-action="edit-transaction" data-id="${t.id}"><i class="fas fa-pencil-alt"></i></button>
                        <button class="action-btn danger" data-action="delete-transaction" data-id="${t.id}"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                return item;
            },

            renderGoals() {
                const grid = document.getElementById('goalsGrid');
                grid.innerHTML = '';
                App.State.userData.goals.forEach(goal => {
                    const progress = (goal.currentAmount / goal.targetAmount) * 100;
                    const card = document.createElement('div');
                    card.className = 'goal-card';
                    card.innerHTML = `
                        <div class="goal-header">
                            <div class="goal-info">
                                <div class="goal-icon"><i class="fas ${goal.icon}"></i></div>
                                <div>
                                    <div class="goal-name">${goal.name}</div>
                                    <div class="goal-target">Target: ${App.Logic.formatCurrency(goal.targetAmount)}</div>
                                </div>
                            </div>
                        </div>
                        <div class="goal-progress">
                            <div class="goal-progress-bar">
                                <div class="goal-progress-fill" style="width: ${progress}%;"></div>
                            </div>
                            <div class="goal-progress-text">
                                <span class="goal-current">${App.Logic.formatCurrency(goal.currentAmount)}</span>
                                <span class="goal-percentage">${Math.round(progress)}%</span>
                            </div>
                        </div>
                        <div class="goal-actions">
                            <button class="action-btn" data-action="edit-goal" data-id="${goal.id}"><i class="fas fa-pencil-alt"></i></button>
                            <button class="action-btn danger" data-action="delete-goal" data-id="${goal.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            },

            renderReports() {
                App.UI.renderExpensePieChart();
                App.UI.renderIncomeExpenseBarChart();
            },

            renderExpensePieChart() {
                const ctx = document.getElementById('expensePieChart').getContext('2d');
                if (App.State.charts.expensePie) App.State.charts.expensePie.destroy();

                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const monthlyExpenses = App.State.userData.transactions.filter(t => t.type === 'expense' && new Date(t.date) >= startOfMonth);

                const dataByCat = monthlyExpenses.reduce((acc, t) => {
                    const catName = App.State.userData.categories.find(c => c.id === t.categoryId)?.name || 'Uncategorized';
                    acc[catName] = (acc[catName] || 0) + t.amount;
                    return acc;
                }, {});

                App.State.charts.expensePie = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: Object.keys(dataByCat),
                        datasets: [{
                            data: Object.values(dataByCat),
                            backgroundColor: Object.keys(dataByCat).map((_, i) => `hsl(${i * 40}, 70%, 60%)`),
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                    }
                });
            },

            renderIncomeExpenseBarChart() {
                const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
                if (App.State.charts.incomeExpense) App.State.charts.incomeExpense.destroy();

                const labels = [];
                const incomeData = [];
                const expenseData = [];

                for (let i = 5; i >= 0; i--) {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    labels.push(d.toLocaleString('default', { month: 'short' }));

                    const monthTransactions = App.State.userData.transactions.filter(t => {
                        const tDate = new Date(t.date);
                        return tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear();
                    });

                    incomeData.push(monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                    expenseData.push(monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
                }

                App.State.charts.incomeExpense = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Income',
                            data: incomeData,
                            backgroundColor: 'rgba(0, 184, 148, 0.7)',
                        }, {
                            label: 'Expenses',
                            data: expenseData,
                            backgroundColor: 'rgba(225, 112, 85, 0.7)',
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            },

            renderSettings() {
                const {
                    settings
                } = App.State.userData;
                document.getElementById('themeToggle').checked = settings.theme === 'light';
                document.documentElement.dataset.theme = settings.theme;
                document.getElementById('defaultCurrency').value = settings.defaultCurrency;

                const accSelect = document.getElementById('defaultAccount');
                accSelect.innerHTML = '<option value="">Select Account</option>';
                App.State.userData.accounts.forEach(acc => {
                    const opt = document.createElement('option');
                    opt.value = acc.id;
                    opt.textContent = acc.name;
                    accSelect.appendChild(opt);
                });
                accSelect.value = settings.defaultAccount;
            },

            renderCalendar() {
                const calendarEl = document.getElementById('calendar');
                if (!App.State.calendar) {
                    App.State.calendar = new FullCalendar.Calendar(calendarEl, {
                        initialView: 'dayGridMonth',
                        headerToolbar: {
                            left: 'prev,next today',
                            center: 'title',
                            right: 'dayGridMonth,timeGridWeek,listWeek'
                        },
                        events: App.State.userData.transactions.map(t => ({
                            id: t.id,
                            title: t.description,
                            start: t.date,
                            allDay: true,
                            className: `fc-event-${t.type}`
                        })),
                        dateClick: (info) => {
                            App.UI.showForm('transaction', {
                                date: info.dateStr
                            });
                        },
                        eventClick: (info) => {
                            const transaction = App.State.userData.transactions.find(t => t.id === info.event.id);
                            if (transaction) {
                                App.UI.showForm('transaction', transaction);
                            }
                        }
                    });
                    App.State.calendar.render();
                } else {
                    App.State.calendar.removeAllEvents();
                    App.State.calendar.addEventSource(App.State.userData.transactions.map(t => ({
                        id: t.id,
                        title: t.description,
                        start: t.date,
                        allDay: true,
                        className: `fc-event-${t.type}`
                    })));
                }
            },

            updateFilterOptions() {
                const catSelect = document.getElementById('categoryFilter');
                const accSelect = document.getElementById('accountFilter');
                const currentCat = catSelect.value;
                const currentAcc = accSelect.value;

                catSelect.innerHTML = '<option value="">All Categories</option>';
                App.State.userData.categories.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    catSelect.appendChild(opt);
                });

                accSelect.innerHTML = '<option value="">All Accounts</option>';
                App.State.userData.accounts.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = a.name;
                    accSelect.appendChild(opt);
                });

                catSelect.value = currentCat;
                accSelect.value = currentAcc;
            },

            getCategoryColor(categoryId) {
                const colors = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#74b9ff', '#ff7675', '#a29bfe'];
                const index = App.State.userData.categories.findIndex(c => c.id === categoryId);
                return colors[index % colors.length];
            },

            showModal(id) {
                document.getElementById(id)?.classList.add('active');
            },

            closeModal(id) {
                document.getElementById(id)?.classList.remove('active');
            },

            showToast(title, message, type = 'info') {
                const container = document.getElementById('toastContainer');
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.innerHTML = `
                    <div class="toast-icon"><i class="fas fa-info-circle"></i></div>
                    <div class="toast-content">
                        <div class="toast-title">${title}</div>
                        <div class="toast-message">${message}</div>
                    </div>
                    <button class="toast-close">&times;</button>
                `;
                container.appendChild(toast);
                toast.querySelector('.toast-close').onclick = () => toast.remove();
                setTimeout(() => toast.remove(), 5000);
            },

            showLoading() {
                document.getElementById('loadingOverlay').classList.add('active');
            },

            hideLoading() {
                document.getElementById('loadingOverlay').classList.remove('active');
            },

            showForm(type, data = {}) {
                const form = document.getElementById('dynamicForm');
                const title = document.getElementById('formModalTitle');
                form.innerHTML = '';
                form.dataset.type = type;
                form.dataset.id = data.id || '';

                let fields = '';
                switch (type) {
                    case 'transaction':
                        title.textContent = data.id ? 'Edit Transaction' : 'Add Transaction';
                        fields = App.UI.getTransactionFormFields(data);
                        break;
                    case 'account':
                        title.textContent = data.id ? 'Edit Account' : 'Add Account';
                        fields = App.UI.getAccountFormFields(data);
                        break;
                    case 'category':
                        title.textContent = data.id ? 'Edit Category' : 'Add Category';
                        fields = App.UI.getCategoryFormFields(data);
                        break;
                    case 'goal':
                        title.textContent = data.id ? 'Edit Goal' : 'Add Goal';
                        fields = App.UI.getGoalFormFields(data);
                        break;
                }

                form.innerHTML = fields + `<button type="submit" class="btn btn-primary btn-full">${data.id ? 'Save Changes' : 'Add'}</button>`;
                App.UI.showModal('formModal');
                App.UI.addFormEventListeners(type);
            },

            getTransactionFormFields(data) {
                const {
                    accounts,
                    categories
                } = App.State.userData;
                const accountOptions = accounts.map(a => `<option value="${a.id}" ${data.accountId === a.id ? 'selected' : ''}>${a.name}</option>`).join('');
                const categoryOptions = categories.map(c => `<option value="${c.id}" ${data.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');

                return `
                    <div class="form-group">
                        <label for="type">Type</label>
                        <select id="type" required>
                            <option value="expense" ${data.type === 'expense' ? 'selected' : ''}>Expense</option>
                            <option value="income" ${data.type === 'income' ? 'selected' : ''}>Income</option>
                            <option value="transfer" ${data.type === 'transfer' ? 'selected' : ''}>Transfer</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="description">Description</label>
                        <input type="text" id="description" value="${data.description || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="amount">Amount</label>
                        <input type="number" id="amount" value="${data.amount || ''}" required step="0.01">
                    </div>
                    <div class="form-group">
                        <label for="date">Date</label>
                        <input type="date" id="date" value="${data.date || new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group" id="fromAccountGroup">
                        <label for="accountId">From Account</label>
                        <select id="accountId" required>${accountOptions}</select>
                    </div>
                    <div class="form-group" id="toAccountGroup" style="display: ${data.type === 'transfer' ? 'block' : 'none'}">
                        <label for="toAccountId">To Account</label>
                        <select id="toAccountId">${accountOptions}</select>
                    </div>
                    <div class="form-group" id="categoryGroup" style="display: ${data.type !== 'income' ? 'block' : 'none'}">
                        <label for="categoryId">Category</label>
                        <select id="categoryId">${categoryOptions}</select>
                    </div>
                    <div class="form-group">
                        <label for="tags">Tags (comma-separated)</label>
                        <input type="text" id="tags" value="${data.tags ? data.tags.join(', ') : ''}">
                    </div>
                    <div class="form-group">
                        <label for="receipt">Receipt</label>
                        <input type="file" id="receipt" accept="image/*,application/pdf">
                        ${data.receipt ? `<a href="${data.receipt.url}" target="_blank">View current receipt</a>` : ''}
                    </div>
                `;
            },

            getAccountFormFields(data) {
                const iconOptions = ['fa-money-bill-wave', 'fa-university', 'fa-credit-card', 'fa-piggy-bank', 'fa-wallet'].map(i => `<option value="${i}" ${data.icon === i ? 'selected' : ''}>${i}</option>`).join('');
                return `
                    <div class="form-group">
                        <label for="name">Account Name</label>
                        <input type="text" id="name" value="${data.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="balance">Initial Balance</label>
                        <input type="number" id="balance" value="${data.balance || 0}" step="0.01" ${data.id ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="type">Account Type</label>
                        <select id="type" required>
                            <option value="bank" ${data.type === 'bank' ? 'selected' : ''}>Bank</option>
                            <option value="cash" ${data.type === 'cash' ? 'selected' : ''}>Cash</option>
                            <option value="credit" ${data.type === 'credit' ? 'selected' : ''}>Credit</option>
                            <option value="investment" ${data.type === 'investment' ? 'selected' : ''}>Investment</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="icon">Icon</label>
                        <select id="icon">${iconOptions}</select>
                    </div>
                `;
            },

            getCategoryFormFields(data) {
                const icons = ['fa-shopping-cart', 'fa-home', 'fa-car', 'fa-film', 'fa-utensils', 'fa-briefcase', 'fa-graduation-cap', 'fa-heartbeat'];
                const iconPicker = icons.map(icon => `<div class="icon-option ${data.icon === icon ? 'active' : ''}" data-icon="${icon}"><i class="fas ${icon}"></i></div>`).join('');
                return `
                    <div class="form-group">
                        <label for="name">Category Name</label>
                        <input type="text" id="name" value="${data.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="budget">Monthly Budget (0 for no budget)</label>
                        <input type="number" id="budget" value="${data.budget || 0}" step="1">
                    </div>
                    <div class="form-group">
                        <label>Icon</label>
                        <div class="icon-picker">${iconPicker}</div>
                        <input type="hidden" id="icon" value="${data.icon || 'fa-shopping-cart'}">
                    </div>
                `;
            },

            getGoalFormFields(data) {
                const iconOptions = ['fa-car', 'fa-home', 'fa-graduation-cap', 'fa-plane', 'fa-gift'].map(i => `<option value="${i}" ${data.icon === i ? 'selected' : ''}>${i}</option>`).join('');
                return `
                    <div class="form-group">
                        <label for="name">Goal Name</label>
                        <input type="text" id="name" value="${data.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="targetAmount">Target Amount</label>
                        <input type="number" id="targetAmount" value="${data.targetAmount || ''}" required step="0.01">
                    </div>
                    <div class="form-group">
                        <label for="targetDate">Target Date</label>
                        <input type="date" id="targetDate" value="${data.targetDate || ''}">
                    </div>
                    <div class="form-group">
                        <label for="icon">Icon</label>
                        <select id="icon">${iconOptions}</select>
                    </div>
                `;
            },

            addFormEventListeners(type) {
                if (type === 'category') {
                    document.querySelector('.icon-picker').addEventListener('click', e => {
                        if (e.target.closest('.icon-option')) {
                            document.querySelector('.icon-option.active')?.classList.remove('active');
                            const option = e.target.closest('.icon-option');
                            option.classList.add('active');
                            document.getElementById('icon').value = option.dataset.icon;
                        }
                    });
                }
                if (type === 'transaction') {
                    document.getElementById('type').addEventListener('change', e => {
                        const isTransfer = e.target.value === 'transfer';
                        const isIncome = e.target.value === 'income';
                        document.getElementById('toAccountGroup').style.display = isTransfer ? 'block' : 'none';
                        document.getElementById('categoryGroup').style.display = isIncome ? 'none' : 'block';
                        document.getElementById('fromAccountGroup').querySelector('label').textContent = isTransfer ? 'From Account' : 'Account';
                    });
                }
            },

            handleFormSubmit(e) {
                e.preventDefault();
                const form = e.target;
                const type = form.dataset.type;
                const id = form.dataset.id;
                let data = {
                    id
                };

                switch (type) {
                    case 'transaction':
                        data.type = form.querySelector('#type').value;
                        data.description = form.querySelector('#description').value;
                        data.amount = parseFloat(form.querySelector('#amount').value);
                        data.date = form.querySelector('#date').value;
                        data.accountId = form.querySelector('#accountId').value;
                        if (data.type === 'transfer') {
                            data.toAccountId = form.querySelector('#toAccountId').value;
                        }
                        if (data.type !== 'income') {
                            data.categoryId = form.querySelector('#categoryId').value;
                        }
                        data.tags = form.querySelector('#tags').value.split(',').map(t => t.trim()).filter(Boolean);
                        const receiptFile = form.querySelector('#receipt').files[0];
                        if (receiptFile) {
                            App.DB.uploadReceipt(receiptFile).then(receiptData => {
                                data.receipt = receiptData;
                                App.Logic.processCRUD(type, id ? 'update' : 'add', data);
                            });
                            return; // Wait for upload
                        } else {
                            const existingTransaction = App.State.userData.transactions.find(t => t.id === id);
                            if (existingTransaction && existingTransaction.receipt) {
                                data.receipt = existingTransaction.receipt;
                            }
                        }
                        break;
                    case 'account':
                        data.name = form.querySelector('#name').value;
                        if (!id) data.balance = parseFloat(form.querySelector('#balance').value);
                        else data.balance = App.State.userData.accounts.find(a => a.id === id).balance;
                        data.type = form.querySelector('#type').value;
                        data.icon = form.querySelector('#icon').value;
                        break;
                    case 'category':
                        data.name = form.querySelector('#name').value;
                        data.budget = parseFloat(form.querySelector('#budget').value);
                        data.icon = form.querySelector('#icon').value;
                        break;
                    case 'goal':
                        data.name = form.querySelector('#name').value;
                        data.targetAmount = parseFloat(form.querySelector('#targetAmount').value);
                        data.targetDate = form.querySelector('#targetDate').value;
                        data.icon = form.querySelector('#icon').value;
                        if (!id) data.currentAmount = 0;
                        else data.currentAmount = App.State.userData.goals.find(g => g.id === id).currentAmount;
                        break;
                }
                App.Logic.processCRUD(type, id ? 'update' : 'add', data);
            },

            handleMainContentClick(e) {
                const action = e.target.closest('[data-action]');
                if (!action) return;

                const [actionType, itemType] = action.dataset.action.split('-');
                const id = action.dataset.id;
                const item = App.State.userData[`${itemType}s`].find(i => i.id === id);

                if (actionType === 'edit') {
                    App.UI.showForm(itemType, item);
                } else if (actionType === 'delete') {
                    App.UI.showModal('confirmModal');
                    document.getElementById('confirmModalMessage').textContent = `Are you sure you want to delete this ${itemType}? This action cannot be undone.`;
                    document.getElementById('confirmActionBtn').onclick = () => {
                        App.Logic.processCRUD(itemType, 'delete', {
                            id
                        });
                        App.UI.closeModal('confirmModal');
                    };
                }
            }
        },

        // --- INITIALIZATION ---
        init() {
            // Firebase Auth Listener
            onAuthStateChanged(window.auth, App.Auth.handleAuthStateChange);

            // Event Listeners
            // Auth Modal
            document.querySelector('#authModal .auth-tabs').addEventListener('click', e => {
                if (e.target.matches('.auth-tab')) {
                    const tab = e.target.dataset.tab;
                    document.querySelector('#authModal .auth-tab.active').classList.remove('active');
                    document.querySelector('#authModal .auth-form.active').classList.remove('active');
                    e.target.classList.add('active');
                    document.getElementById(`${tab}Form`).classList.add('active');
                }
            });

            document.getElementById('loginBtn').parentElement.addEventListener('submit', e => {
                e.preventDefault();
                App.Auth.login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            });

            document.getElementById('registerBtn').parentElement.addEventListener('submit', e => {
                e.preventDefault();
                const password = document.getElementById('registerPassword').value;
                if (!App.Logic.validatePassword(password)) {
                    App.UI.showToast('Invalid Password', 'Password must be at least 8 characters, with one uppercase letter and one number.', 'error');
                    return;
                }
                App.Auth.register(
                    document.getElementById('registerName').value,
                    document.getElementById('registerEmail').value,
                    password,
                    document.getElementById('studentCheckbox').checked
                );
            });

            document.getElementById('googleLoginBtn').addEventListener('click', App.Auth.signInWithGoogle);
            document.getElementById('googleRegisterBtn').addEventListener('click', App.Auth.signInWithGoogle);
            document.getElementById('logoutBtn').addEventListener('click', App.Auth.logout);

            // Modals
            document.querySelectorAll('.modal-close, .modal[id="confirmModal"] #confirmCancelBtn').forEach(el => {
                el.addEventListener('click', () => App.UI.closeModal(el.closest('.modal').id));
            });

            // Navigation
            document.querySelector('.sidebar-nav').addEventListener('click', e => {
                const link = e.target.closest('.nav-link');
                if (link) {
                    e.preventDefault();
                    document.querySelector('.nav-link.active').classList.remove('active');
                    link.classList.add('active');
                    document.querySelector('.content-section.active').classList.remove('active');
                    document.getElementById(`${link.dataset.section}-section`).classList.add('active');
                    if (link.dataset.section === 'calendar') App.State.calendar.render();
                }
            });

            // Main Action Buttons
            document.getElementById('addTransactionBtn').addEventListener('click', () => App.UI.showForm('transaction'));
            document.getElementById('addAccountBtn').addEventListener('click', () => App.UI.showForm('account'));
            document.getElementById('addGoalBtn').addEventListener('click', () => App.UI.showForm('goal'));
            document.getElementById('manageCategoriesBtn').addEventListener('click', () => App.UI.showForm('category'));

            // Dynamic Form Submission
            document.getElementById('dynamicForm').addEventListener('submit', App.UI.handleFormSubmit);

            // Click delegation for edit/delete
            document.querySelector('.main-content').addEventListener('click', App.UI.handleMainContentClick);

            // Settings
            document.getElementById('themeToggle').addEventListener('change', e => {
                const theme = e.target.checked ? 'light' : 'dark';
                document.documentElement.dataset.theme = theme;
                App.DB.updateUserData({ 'settings.theme': theme });
                App.Analytics.track('theme_change', { theme });
            });
            document.getElementById('defaultCurrency').addEventListener('change', e => {
                App.DB.updateUserData({
                    'settings.defaultCurrency': e.target.value
                });
            });
            document.getElementById('defaultAccount').addEventListener('change', e => {
                App.DB.updateUserData({
                    'settings.defaultAccount': e.target.value
                });
            });
            document.getElementById('resetDataBtn').addEventListener('click', () => {
                App.UI.showModal('confirmModal');
                document.getElementById('confirmModalMessage').textContent = 'DANGER: This will reset all your data to the default state. This action is irreversible. Are you absolutely sure?';
                document.getElementById('confirmActionBtn').onclick = () => {
                    const defaultData = App.Logic.getDefaultUserData(false);
                    App.DB.updateUserData(defaultData);
                    App.UI.closeModal('confirmModal');
                };
            });

            // Reports
            document.getElementById('exportDataBtn').addEventListener('click', () => App.UI.showModal('exportModal'));
            document.getElementById('exportCSVBtn').addEventListener('click', App.Logic.exportToCSV);
            document.getElementById('exportPDFBtn').addEventListener('click', App.Logic.exportToPDF);
            document.getElementById('generateAISummaryBtn').addEventListener('click', () => {
                const summary = App.Logic.generateAISummary();
                document.getElementById('aiSummaryContent').textContent = summary;
            });

            // Transaction Filters
            document.querySelector('.transaction-filters').addEventListener('change', App.UI.renderTransactions);
            document.getElementById('clearFiltersBtn').addEventListener('click', () => {
                document.getElementById('dateFromFilter').value = '';
                document.getElementById('dateToFilter').value = '';
                document.getElementById('typeFilter').value = '';
                document.getElementById('categoryFilter').value = '';
                document.getElementById('accountFilter').value = '';
                App.UI.renderTransactions();
            });

            // Initial check for theme from localStorage
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.documentElement.dataset.theme = savedTheme;
            document.getElementById('themeToggle').checked = savedTheme === 'light';
        }
    };

    // Initialize the application
    document.addEventListener('DOMContentLoaded', App.init);

})();
