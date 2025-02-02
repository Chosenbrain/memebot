require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");

// Import our modules
const serverModule = require("./server");
const listenerModule = require("./listener");

// Create Express app and serve static files from the public folder
const app = express();
app.use(express.static("public"));

// Create HTTP server and Socket.IO instance with CORS enabled for your Netlify dashboard
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://memecoinbot.netlify.app/", // Replace with your actual Netlify URL
    methods: ["GET", "POST"]
  }
});

// Start the HTTP server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// Create a single Telegram bot instance with polling
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize the server and listener modules with the shared Telegram bot and Socket.IO instance
serverModule.init(telegramBot, io);
listenerModule.init(telegramBot, io);

console.log("Main process started with a single Telegram bot instance and Socket.IO.");
