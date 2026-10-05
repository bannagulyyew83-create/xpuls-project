const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const JWT_SECRET = 'xpuls_secret_key_2026';

let users = {};             
let withdrawRequests = [];   
let smsCodes = {};           
let dailyGames = [];         
let userBets = [];           

function generateDailyGames() {
    const teams = [
        ["Real Madrid", "Barcelona"], ["Arsenal", "Chelsea"],
        ["Inter", "AC Milan"], ["PSG", "Marseille"],
        ["Bayern Munich", "Dortmund"], ["Juventus", "Napoli"]
    ];
    
    dailyGames = teams.map((team, idx) => ({
        id: idx + 1,
        league: "Top Çempionatlar",
        team1: team[0],
        team2: team[1],
        time: "21:45",
        p1: parseFloat((1.5 + Math.random() * 1.5).toFixed(2)),
        px: parseFloat((3.0 + Math.random() * 1.0).toFixed(2)),
        p2: parseFloat((2.0 + Math.random() * 2.0).toFixed(2))
    }));
}
generateDailyGames();

cron.schedule('0 0 * * *', () => {
    generateDailyGames();
});

app.get('/api/games/daily', (req, res) => {
    res.json({ success: true, games: dailyGames });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, phone } = req.body;
    if (!username || !password || !phone) {
        return res.status(400).json({ success: false, message: 'Ähli meýdançalary dolduryň!' });
    }
    if (users[username]) {
        return res.status(400).json({ success: false, message: 'Bu ulanyjy ady eýýäm bar!' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = {
        password: hashedPassword,
        phone: phone,
        balance: 0.00,
        deposits: []
    };
    res.json({ success: true, message: 'Registrasiýa üstünlikli geçdi!' });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ success: false, message: 'Ulanyjy ady ýa-da parol nädogry!' });
    }
    const token = jwt.encode({ username }, JWT_SECRET);
    res.json({ success: true, token, username, balance: user.balance });
});

function authenticate(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ success: false, message: 'Awtorizasiýa gerek!' });
    try {
        const decoded = jwt.decode(token, JWT_SECRET);
        req.username = decoded.username;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Sessiýa möhleti gutardy!' });
    }
}

app.post('/api/bet/place', authenticate, (req, res) => {
    const { gameId, outcome, amount } = req.body;
    const user = users[req.username];
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Dogry mukdar giriziň!' });
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Balansyňyzda ýeterlik pul ýok!' });
    
    const game = dailyGames.find(g => g.id === gameId);
    if (!game) return res.status(400).json({ success: false, message: 'Oýun tapylmady!' });

    user.balance -= amount;
    res.json({ success: true, message: 'Şertiňiz kabul edildi!', newBalance: user.balance });
});

app.post('/api/casino/play', authenticate, (req, res) => {
    const { betAmount } = req.body;
    const user = users[req.username];
    if (!betAmount || betAmount <= 0) return res.status(400).json({ success: false, message: 'Dogry mukdar giriziň!' });
    if (user.balance < betAmount) return res.status(400).json({ success: false, message: 'Balansyňyzda ýeterlik pul ýok!' });

    user.balance -= betAmount;
    const isWin = Math.random() < 0.45;
    let winAmount = 0;
    if (isWin) {
        winAmount = betAmount * 2;
        user.balance += winAmount;
    }
    res.json({
        success: true,
        isWin,
        winAmount,
        message: isWin ? `Gutlaýarys! ${winAmount.toFixed(2)} TMT utduňyz!` : 'Ututdyňyz, ýene synanyşyň!',
        newBalance: user.balance
    });
});

app.post('/api/sms/send', authenticate, (req, res) => {
    const { phone, amount, type } = req.body;
    const user = users[req.username];
    if (!phone || !amount || amount <= 0) return res.status(400).json({ success: false, message: 'Dogry maglumat giriziň!' });
    if (type === 'withdraw' && user.balance < amount) return res.status(400).json({ success: false, message: 'Balansda pul ýeterlik däl!' });

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    smsCodes[req.username] = { code, phone, amount, type };
    console.log(`[SMS KOD] User: ${req.username} | Kod: ${code}`);
    res.json({ success: true, message: 'SMS kod iberildi', debugCode: code });
});

app.post('/api/sms/confirm', authenticate, (req, res) => {
    const { code } = req.body;
    const session = smsCodes[req.username];
    const user = users[req.username];
    if (!session || session.code !== code) return res.status(400).json({ success: false, message: 'Kod nädogry!' });

    if (session.type === 'deposit') {
        user.balance += session.amount;
        delete smsCodes[req.username];
        return res.json({ success: true, message: `${session.amount} TMT balansyňyza salyndy!`, newBalance: user.balance });
    } else if (session.type === 'withdraw') {
        user.balance -= session.amount;
        delete smsCodes[req.username];
        return res.json({ success: true, message: `Wywod haýyşy kabul edildi!`, newBalance: user.balance });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`X-Puls Back-end ${PORT}-portda taýýar!`);
});
