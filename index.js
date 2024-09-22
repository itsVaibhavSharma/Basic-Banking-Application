const express = require('express');
const { Client } = require('pg');
const path = require('path');

const app = express();

app.use(express.static('public'));
app.use(express.json());

// PostgreSQL connection
const db = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://default:lmeuKtvbA9r0@ep-morning-voice-a4ds1ucg.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require",
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err);
        return;
    }
    console.log('PostgreSQL Connected...');
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
        res.json(results.rows);
    });
});

// API route to get a single customer by email
app.get('/api/customer/:email', (req, res) => {
    const customerEmail = req.params.email;
    db.query('SELECT * FROM customers WHERE email = $1', [customerEmail], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Server error');
            return;
        }
        if (results.rows.length === 0) {
            res.status(404).send('Customer not found');
            return;
        }
        res.json(results.rows[0]);
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
    db.query('BEGIN', (err) => {
        if (err) return handleError(err);

        // Check if fromCustomerEmail exists and has sufficient balance
        db.query('SELECT current_balance FROM customers WHERE email = $1 FOR UPDATE', [fromCustomerEmail], (err, results) => {
            if (err) return db.query('ROLLBACK', () => handleError(err));
            if (results.rows.length === 0) return db.query('ROLLBACK', () => handleError(new Error('From customer not found')));

            const fromBalance = results.rows[0].current_balance;

            if (fromBalance < amount) return db.query('ROLLBACK', () => handleError(new Error('Insufficient funds')));

            // Update fromCustomer balance
            db.query('UPDATE customers SET current_balance = current_balance - $1 WHERE email = $2', [amount, fromCustomerEmail], (err) => {
                if (err) return db.query('ROLLBACK', () => handleError(err));

                // Update toCustomer balance
                db.query('UPDATE customers SET current_balance = current_balance + $1 WHERE email = $2', [amount, toCustomerEmail], (err) => {
                    if (err) return db.query('ROLLBACK', () => handleError(err));

                    // Record the transfer
                    db.query('INSERT INTO transfers (from_customer_email, to_customer_email, amount) VALUES ($1, $2, $3)', [fromCustomerEmail, toCustomerEmail, amount], (err) => {
                        if (err) return db.query('ROLLBACK', () => handleError(err));

                        // Commit the transaction
                        db.query('COMMIT', (err) => {
                            if (err) return db.query('ROLLBACK', () => handleError(err));

                            res.send('Transfer successful');
                        });
                    });
                });
            });
        });
    });

    function handleError(err) {
        console.error('Transaction error:', err);
        res.status(500).send(`Server error: ${err.message}`);
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
