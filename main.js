require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const serverModule = require("./server");
const listenerModule = require("./listener");

// Create Express app and serve static files from public folder
const app = express();
app.use(express.static("public"));

// Create HTTP server and Socket.IO instance
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// Create a single Telegram bot instance with polling
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize server and listener modules with the shared instances
serverModule.init(telegramBot, io);
listenerModule.init(telegramBot, io);

console.log("Main process started with a single Telegram bot instance and Socket.IO.");
