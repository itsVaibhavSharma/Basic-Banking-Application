const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();

app.use(express.static('public'));
app.use(express.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Vaib@8085AK', // Replace with your MySQL root password
    database: 'bank'
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('MySQL Connected...');
});

// Serve the main HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/customers', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'customers.html'));
});

app.get('/customer/:email', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

// API route to get all customers
app.get('/api/customers', (req, res) => {
    db.query('SELECT * FROM customers', (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Server error');
            return;
        }
        res.json(results);
    });
});

// API route to get a single customer by email
app.get('/api/customer/:email', (req, res) => {
    const customerEmail = req.params.email;
    db.query('SELECT * FROM customers WHERE email = ?', [customerEmail], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Server error');
            return;
        }
        if (results.length === 0) {
            res.status(404).send('Customer not found');
            return;
        }
        res.json(results[0]);
    });
});

// API route to transfer money between customers
app.post('/api/transfer', (req, res) => {
    const { fromCustomerEmail, toCustomerEmail, amount } = req.body;

    if (!fromCustomerEmail || !toCustomerEmail || !amount) {
        return res.status(400).send('Invalid request: Missing parameters');
    }

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send('Invalid request: Amount must be a positive number');
    }

    // Start transaction
    db.beginTransaction(err => {
        if (err) return handleError(err);

        // Check if fromCustomerEmail exists and has sufficient balance
        db.query('SELECT current_balance FROM customers WHERE email = ?', [fromCustomerEmail], (err, results) => {
            if (err) return db.rollback(() => handleError(err));
            if (results.length === 0) return db.rollback(() => handleError(new Error('From customer not found')));
            const fromBalance = results[0].current_balance;

            if (fromBalance < amount) return db.rollback(() => handleError(new Error('Insufficient funds')));

            // Update fromCustomer balance
            db.query('UPDATE customers SET current_balance = current_balance - ? WHERE email = ?', [amount, fromCustomerEmail], (err, result) => {
                if (err) return db.rollback(() => handleError(err));

                // Update toCustomer balance
                db.query('UPDATE customers SET current_balance = current_balance + ? WHERE email = ?', [amount, toCustomerEmail], (err, result) => {
                    if (err) return db.rollback(() => handleError(err));

                    // Record the transfer
                    db.query('INSERT INTO transfers (from_customer_email, to_customer_email, amount) VALUES (?, ?, ?)', [fromCustomerEmail, toCustomerEmail, amount], (err, result) => {
                        if (err) return db.rollback(() => handleError(err));

                        // Commit the transaction
                        db.commit(err => {
                            if (err) return db.rollback(() => handleError(err));

                            res.send('Transfer successful');
                        });
                    });
                });
            });
        });
    });

    function handleError(err) {
        console.error('Transaction error:', err);
        db.rollback(() => res.status(500).send(`Server error: ${err.message}`));
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
