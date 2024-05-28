require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// Muat token dari file .env
const token = process.env.TELEGRAM_BOT_TOKEN;
const baseApiUrl = process.env.API_URL;
const allowedGroupsId = [-1002079506274, 339890451];

// Buat instance bot dengan webhook
const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 80;

app.use(bodyParser.json());

// Route untuk menerima update dari Telegram (hanya jika menggunakan webhook)
app.post(`/bot${token}`, (req, res) => {
	bot.processUpdate(req.body);
	res.sendStatus(200);
});

// Route untuk root URL
app.get('/', (req, res) => {
	res.send('Bot Telegram berjalan dengan baik!');
});

const isAllowedGroup = (chatId) => {
	return allowedGroupsId.includes(chatId);
};

// Ketika bot menerima command '/start'
bot.onText(/\/start/, (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const message = 'Selamat datang di bot kami! Ketik /help untuk melihat daftar perintah.';
	bot.sendMessage(chatId, message);
});

// Ketika bot menerima command '/help'
bot.onText(/\/help/, (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const message = 'Daftar perintah:\n/start - Mulai bot \n/help - Bantuan \n/transactions - Lihat 10 data transaksi terbaru \n/investors - Lihat data investor \n/coins - Lihat koin yang dimiliki';
	bot.sendMessage(chatId, message);
});

// Fungsi untuk mengambil data JSON dari URL eksternal
const getDataFromApi = async (type) => {
	try {
		const response = await axios.get(`${baseApiUrl}?data=${type}`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching ${type} data:`, error);
		return null;
	}
};

const tableInvestors = (data) => {
	const { totalDana: dana, dataInvestor } = data;
	const totalDana = Number(dana).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	let table = `\`\`\`Investors\n`; // Membuka blok kode untuk monospace di Telegram
	table += `No  Nama       Ticker      Total Harga        Total Coin      Kepemilikan\n`;
	table += `--------------------------------------------------------------------------\n`;
	dataInvestor.forEach((investor, index) => {
		const { username, ticker, totalPrice: price, totalCoin: coin, ownership_percentage: percentage } = investor;
		const name = username.charAt(0).toUpperCase() + username.slice(1);
		const totalPrice = Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const totalCoin = Number(coin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const ownership_percentage = (totalCoin != 0 ? (percentage != 100 ? parseFloat(percentage).toFixed(2) : 100) : 0) + '%';

		table += `${String(index + 1).padEnd(3)} ${name.padEnd(10)} ${ticker.toUpperCase().padEnd(11)} Rp. ${String(totalPrice).padEnd(14)} ${String(totalCoin).padEnd(15)} ${String(ownership_percentage).padEnd(12)}\n`;
	});
	table += `\nDana saat ini: Rp. ${totalDana}`;
	table += `\`\`\``; // Menutup blok kode untuk monospace di Telegram
	return table;
};

// Ketika bot menerima command '/investors'
bot.onText(/\/investors/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil data investor, mohon tunggu...');
	const data = await getDataFromApi('investors');

	if (data) {
		const message = tableInvestors(data);
		bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil data investor. Silakan coba lagi nanti.');
	}

	bot.deleteMessage(chatId, loadingMessage.message_id);
});

const tableCoins = (data) => {
	let table = `\`\`\`Coins\n`; // Membuka blok kode untuk monospace di Telegram
	table += `No  Nama Koin        Ticker      Total Koin\n`;
	table += `----------------------------------------------\n`;
	data.forEach((coin, index) => {
		const { coin: coinName, ticker, total_coin } = coin;
		const totalCoin = Number(total_coin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const name = coinName.charAt(0).toUpperCase() + coinName.slice(1);

		table += `${String(index + 1).padEnd(3)} ${name.padEnd(16)} ${ticker.padEnd(11)} ${totalCoin.padEnd(5)}\n`;
	});
	table += `\`\`\``; // Menutup blok kode untuk monospace di Telegram
	return table;
};

// Ketika bot menerima command '/coins'
bot.onText(/\/coins/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil daftar koin, mohon tunggu...');
	const data = await getDataFromApi('coins');

	if (data) {
		const message = tableCoins(data);
		bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil daftar koin. Silakan coba lagi nanti.');
	}
	bot.deleteMessage(chatId, loadingMessage.message_id);
});

const tableTransactions = (data) => {
	const { transactions, totalDana: tempTotalDana } = data;

	let table = `\`\`\`Transactions\n`; // Membuka blok kode untuk monospace di Telegram
	table += `No  Nama Transaksi       Nama Koin   Ticker     Jumlah Koin   Harga Koin           Total Harga          Investor   Status\n`;
	table += `--------------------------------------------------------------------------------------------------------------------------------\n`;
	transactions.forEach((transaction, index) => {
		const { message: tempMessage, coin, ticker, total_coin, price_coin, status, total_price, investors } = transaction;
		const message = tempMessage.length > 16 ? tempMessage.slice(0, 12) + '...' : tempMessage;
		const totalCoin = Number(total_coin.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const coinName = coin.length > 7 ? coin.charAt(0).toUpperCase() + coin.slice(1, 7) + '...' : coin.charAt(0).toUpperCase() + coin.slice(1);
		const priceCoin = Number(price_coin.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const totalPrice = Number(total_price.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const name = investors.charAt(0).toUpperCase() + investors.slice(1);
		const statusName = status.charAt(0).toUpperCase() + status.slice(1);

		table += `${String(index + 1).padEnd(3)} ${message.padEnd(20)} ${coinName.padEnd(11)} ${ticker.toUpperCase().padEnd(10)} ${totalCoin.padEnd(13)} Rp. ${priceCoin.padEnd(16)} Rp. ${totalPrice.padEnd(16)} ${name.padEnd(
			10
		)} ${statusName}\n`;
	});

	const totalDana = Number(tempTotalDana.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	table += `\nTotal seluruh dana: Rp. ${totalDana}`;
	table += `\nCatatan: Ini mengambil 10 data transaksi terbaru`;
	table += `\`\`\``; // Menutup blok kode untuk monospace di Telegram
	return table;
};

// Ketika bot menerima command '/coins'
bot.onText(/\/transactions/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil data transaksi, mohon tunggu...');
	const data = await getDataFromApi('transactions');

	if (data) {
		const message = tableTransactions(data);
		bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil data transaksi. Silakan coba lagi nanti.');
	}
	bot.deleteMessage(chatId, loadingMessage.message_id);
});

const tableCheckPrice = (data) => {
	const { tickers, coinData } = data;
	const coinDatas = [];

	let table = `\`\`\`Coins_Price\n`; // Membuka blok kode untuk monospace di Telegram
	table += `No  Nama Koin      Rank   Harga Terbaru\n`;
	table += `-------------------------------------------------\n`;
	tickers.forEach((ticker, _) => {
		coinDatas.push(coinData[ticker]);
	});

	const resultCoinsData = coinDatas.sort((a, b) => a.cmc_rank - b.cmc_rank);

	resultCoinsData.forEach((resultCoinData, index) => {
		const { name: coinName, cmc_rank, price_idr } = resultCoinData;
		const name = coinName.charAt(0).toUpperCase() + coinName.slice(1);
		const totalPrice = price_idr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		table += `${String(index + 1).padEnd(3)} ${name.padEnd(14)} ${String(cmc_rank).padEnd(6)} Rp. ${totalPrice.padEnd(16)}\n`;
	});

	table += `\`\`\``; // Menutup blok kode untuk monospace di Telegram
	return table;
};

// Ketika bot menerima command '/cprice'
bot.onText(/\/cprice/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil harga sekarang koin, mohon tunggu...');
	const data = await getDataFromApi('checkPrice');

	if (data) {
		const message = tableCheckPrice(data);
		bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil harga sekarang koin. Silakan coba lagi nanti.');
	}
	bot.deleteMessage(chatId, loadingMessage.message_id);
});

// Ketika bot menerima pesan teks
// bot.on('message', (msg) => {
// 	const chatId = msg.chat.id;
// if (!isAllowedGroup(chatId)) {
// 	return;
// }
// 	// Cek apakah pesan bukan command
// 	if (!msg.text.startsWith('/')) {
// 		bot.sendMessage(chatId, 'Anda mengirim pesan: ' + msg.text);
// 	}
// });

// Jalankan server
app.listen(port, () => {
	console.log(`Bot is listening on port ${port}`);
});
