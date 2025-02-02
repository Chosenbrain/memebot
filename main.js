require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");

const serverModule = require("./server");
const listenerModule = require("./listener");

const app = express();
app.use(express.static("public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://memecoinbot.netlify.app", // Use your actual Netlify URL (without trailing slash)
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

serverModule.init(telegramBot, io);
listenerModule.init(telegramBot, io);

console.log("Main process started with shared Telegram bot and Socket.IO instance.");
