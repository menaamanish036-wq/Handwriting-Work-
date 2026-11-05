const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Uploads folder check
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, 'qr-code-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Session Setup
app.use(session({
    secret: 'handwriting-secret-key',
    resave: false,
    saveUninitialized: true
}));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch(err => console.log("MongoDB Connection Error:", err));

// Schemas
const PaymentSettingSchema = new mongoose.Schema({
    upiId: String,
    qrImageUrl: String
});
const PaymentSetting = mongoose.model('PaymentSetting', PaymentSettingSchema);

const RegistrationSchema = new mongoose.Schema({
    name: String,
    address: String,
    mobile: String,
    pincode: String,
    district: String,
    project: String,
    date: { type: Date, default: Date.now }
});
const Registration = mongoose.model('Registration', RegistrationSchema);

// --- ROUTES ---

// 1. Main Website Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Public API: Fetch Current QR & UPI ID for Customer
app.get('/api/payment-details', async (req, res) => {
    try {
        let setting = await PaymentSetting.findOne();
        if (!setting) {
            // Default Initial Payment Details
            setting = { 
                upiId: '8504823316@thecardco', 
                qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=8504823316@thecardco' 
            };
        }
        res.json(setting);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch payment details' });
    }
});

// 3. Customer Form Submit API
app.post('/api/register', async (req, res) => {
    try {
        const newReg = new Registration(req.body);
        await newReg.save();
        res.json({ success: true, message: 'Registration saved successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error saving registration' });
    }
});

// 4. Admin Login Page
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// 5. Admin Dashboard (Protected)
app.get('/admin', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.redirect('/admin/login');
    }
});

// Admin Login API
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.json({ success: true, redirect: '/admin' });
    }
    res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

// Admin API: Fetch all registrations
app.get('/api/admin/registrations', async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
    const registrations = await Registration.find().sort({ date: -1 });
    res.json(registrations);
});

// Admin API: Update QR Code & UPI ID
app.post('/api/admin/update-qr', upload.single('qrImage'), async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const { upiId } = req.body;
        let qrImageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

        let setting = await PaymentSetting.findOne();
        if (!setting) {
            setting = new PaymentSetting({ 
                upiId, 
                qrImageUrl: qrImageUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=' + upiId 
            });
        } else {
            if (upiId) setting.upiId = upiId;
            if (qrImageUrl) setting.qrImageUrl = qrImageUrl;
        }
        await setting.save();
        res.json({ success: true, message: 'Payment details updated successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update payment settings' });
    }
});

// Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
