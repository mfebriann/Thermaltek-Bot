require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

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
	bot.sendMessage(chatId, message, {
		reply_to_message_id: msg.message_id,
	});
});

// Ketika bot menerima command '/help'
bot.onText(/\/help/, (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const message = 'Daftar perintah:\n/start - Mulai bot \n/help - Bantuan \n/transactions - Lihat 10 data transaksi terbaru \n/investors - Lihat data investor \n/coins - Lihat koin yang dimiliki';
	bot.sendMessage(chatId, message, {
		reply_to_message_id: msg.message_id,
	});
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

const createTableImage = async (data, type) => {
	let width = 1000;
	let height = 1000;
	let columnWidths = [20, 150, 100, 200, 150, 150];

	if (type === 'transactions') {
		width = 1400;
		columnWidths = [20, 220, 150, 80, 150, 200, 200, 90, 50];
	} else if (type === 'checkPrice') {
		columnWidths = [20, 150, 100, 200];
	}

	let canvas = createCanvas(width, height);
	let ctx = canvas.getContext('2d');

	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = '#000';
	ctx.font = '20px Arial';
	let y = 30;
	const padding = 20;

	if (type === 'investors') {
		ctx.fillText('Investors', 10, y);
		y += 50;

		const headers = ['No', 'Nama', 'Ticker', 'Total Harga', 'Total Coin', 'Kepemilikan'];

		// Draw headers
		headers.forEach((header, index) => {
			const x = columnWidths.slice(0, index).reduce((a, b) => a + b, 10) + padding * index;
			ctx.fillText(header, x, y);
		});
		y += 30;
		ctx.fillText('-----------------------------------------------------------------------------------------------------------------------------------', 10, y);
		y += 20;

		data.dataInvestor.forEach((investor, index) => {
			const { username, ticker, totalPrice: price, totalCoin: coin, ownership_percentage: percentage } = investor;
			const name = username.charAt(0).toUpperCase() + username.slice(1);
			const totalPrice = Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const totalCoin = Number(coin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const ownership_percentage = (totalCoin != 0 ? (percentage != 100 ? parseFloat(percentage).toFixed(2) : 100) : 0) + '%';

			const rowData = [String(index + 1), name, ticker.toUpperCase(), `Rp. ${totalPrice}`, totalCoin, ownership_percentage];

			rowData.forEach((text, colIndex) => {
				const x = columnWidths.slice(0, colIndex).reduce((a, b) => a + b, 10) + padding * colIndex;
				ctx.fillText(text, x, y);
			});
			y += 30; // Tambahkan jarak antara baris
		});

		ctx.fillText(`\nDana saat ini: Rp. ${Number(data.totalDana).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 10, y);
	} else if (type === 'coins') {
		ctx.fillText('Daftar Koin', 10, y);
		y += 50;

		const headers = ['No', 'Nama Koin', 'Ticker', 'Total Koin'];

		// Draw headers
		headers.forEach((header, index) => {
			const x = columnWidths.slice(0, index).reduce((a, b) => a + b, 10) + padding * index;
			ctx.fillText(header, x, y);
		});
		y += 30;
		ctx.fillText('------------------------------------------------------------------------------', 10, y);
		y += 20;

		data.forEach((coin, index) => {
			const { coin: coinName, ticker, total_coin } = coin;
			const totalCoin = Number(total_coin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const name = coinName.charAt(0).toUpperCase() + coinName.slice(1);

			const rowData = [String(index + 1), name, ticker.toUpperCase(), totalCoin];

			rowData.forEach((text, colIndex) => {
				const x = columnWidths.slice(0, colIndex).reduce((a, b) => a + b, 10) + padding * colIndex;
				ctx.fillText(text, x, y);
			});
			y += 30; // Tambahkan jarak antara baris
		});
	} else if (type === 'transactions') {
		ctx.fillText('Daftar 25 Transaksi Terbaru', 10, y);
		y += 50;

		const headers = ['No', 'Nama Transaksi', 'Nama Koin', 'Ticker', 'Total Koin', 'Harga Koin', 'Total Harga', 'Investor', 'Status'];

		const { transactions, totalDana } = data;

		// Draw headers
		headers.forEach((header, index) => {
			const x = columnWidths.slice(0, index).reduce((a, b) => a + b, 10) + padding * index;
			ctx.fillText(header, x, y);
		});
		y += 30;
		ctx.fillText('--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------', 10, y);
		y += 20;

		transactions.forEach((transaction, index) => {
			const { message, coin, ticker, total_coin, price_coin, status, total_price, investors } = transaction;

			const totalCoin = Number(total_coin.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const coinName = coin.charAt(0).toUpperCase() + coin.slice(1);
			const priceCoin = 'Rp. ' + Number(price_coin.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const totalPrice = 'Rp. ' + Number(total_price.replaceAll(',', '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			const name = investors.charAt(0).toUpperCase() + investors.slice(1);
			const statusName = status.charAt(0).toUpperCase() + status.slice(1);

			const rowData = [String(index + 1), message, coinName, ticker, totalCoin, priceCoin, totalPrice, name, statusName];

			rowData.forEach((text, colIndex) => {
				const x = columnWidths.slice(0, colIndex).reduce((a, b) => a + b, 10) + padding * colIndex;
				ctx.fillText(text, x, y);
			});
			y += 30; // Tambahkan jarak antara baris
		});

		ctx.fillText(`\nTotal Seluruh Dana: Rp. ${Number(totalDana).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 10, y);
	} else if (type === 'checkPrice') {
		ctx.fillText('Daftar Harga Koin Terbaru', 10, y);
		y += 50;

		const headers = ['No', 'Nama Koin', 'Rank', 'Harga Terbaru'];
		const { tickers, coinData } = data;
		const coinDatas = [];

		tickers.forEach((ticker, _) => {
			coinDatas.push(coinData[ticker]);
		});

		const resultCoinsData = coinDatas.sort((a, b) => a.cmc_rank - b.cmc_rank);

		// Draw headers
		headers.forEach((header, index) => {
			const x = columnWidths.slice(0, index).reduce((a, b) => a + b, 10) + padding * index;
			ctx.fillText(header, x, y);
		});
		y += 30;
		ctx.fillText('----------------------------------------------------------------------------------', 10, y);
		y += 20;

		resultCoinsData.forEach((resultCoinData, index) => {
			const { name: coinName, cmc_rank, price_idr } = resultCoinData;
			const name = coinName.charAt(0).toUpperCase() + coinName.slice(1);
			const totalPrice = 'Rp. ' + price_idr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

			const rowData = [String(index + 1), name, cmc_rank, totalPrice];

			rowData.forEach((text, colIndex) => {
				const x = columnWidths.slice(0, colIndex).reduce((a, b) => a + b, 10) + padding * colIndex;
				ctx.fillText(text, x, y);
			});
			y += 30; // Tambahkan jarak antara baris
		});
	}

	// Simpan gambar sebagai file
	const buffer = canvas.toBuffer('image/png');
	const filePath = path.join(__dirname, 'table.png');
	fs.writeFileSync(filePath, buffer);

	return filePath;
};

// Ketika bot menerima command '/investors'
bot.onText(/\/investors/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}

	const type = 'investors';
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil data investor, mohon tunggu...', {
		reply_to_message_id: msg.message_id,
	});
	const data = await getDataFromApi(type);

	if (data) {
		const imagePath = await createTableImage(data, type);
		bot.sendPhoto(
			chatId,
			imagePath,
			{
				reply_to_message_id: msg.message_id,
			},
			{
				filename: 'table.png',
				contentType: 'image/png',
			}
		);
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil data investor. Silakan coba lagi nanti.');
	}

	bot.deleteMessage(chatId, loadingMessage.message_id);
});

// Ketika bot menerima command '/coins'
bot.onText(/\/coins/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}

	const type = 'coins';
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil daftar koin, mohon tunggu...', {
		reply_to_message_id: msg.message_id,
	});
	const data = await getDataFromApi(type);

	if (data) {
		const imagePath = await createTableImage(data, type);
		bot.sendPhoto(
			chatId,
			imagePath,
			{
				reply_to_message_id: msg.message_id,
			},
			{
				filename: 'table.png',
				contentType: 'image/png',
			}
		);
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil daftar koin. Silakan coba lagi nanti.');
	}
	bot.deleteMessage(chatId, loadingMessage.message_id);
});

// Ketika bot menerima command '/transactions'
bot.onText(/\/transactions/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}

	const type = 'transactions';
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil data transaksi, mohon tunggu...', {
		reply_to_message_id: msg.message_id,
	});
	const data = await getDataFromApi(type);

	if (data) {
		const imagePath = await createTableImage(data, type);
		bot.sendPhoto(
			chatId,
			imagePath,
			{
				reply_to_message_id: msg.message_id,
			},
			{
				filename: 'table.png',
				contentType: 'image/png',
			}
		);
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil data transaksi. Silakan coba lagi nanti.');
	}
	bot.deleteMessage(chatId, loadingMessage.message_id);
});

// Ketika bot menerima command '/cprice'
bot.onText(/\/cprice/, async (msg) => {
	const chatId = msg.chat.id;
	if (!isAllowedGroup(chatId)) {
		return;
	}
	const type = 'checkPrice';
	const loadingMessage = await bot.sendMessage(chatId, 'Mengambil data harga koin terbaru, mohon tunggu...', {
		reply_to_message_id: msg.message_id,
	});
	const data = await getDataFromApi(type);

	if (data) {
		const imagePath = await createTableImage(data, type);
		bot.sendPhoto(
			chatId,
			imagePath,
			{ reply_to_message_id: msg.message_id },
			{
				filename: 'table.png',
				contentType: 'image/png',
			}
		);
	} else {
		bot.sendMessage(chatId, 'Gagal mengambil data harga koin terbaru. Silakan coba lagi nanti.');
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
