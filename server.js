require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration to allow connections from your Netlify domain.
const io = new Server(server, {
  cors: {
    origin: "https://memecoinbot.netlify.app/",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("New client connected");
  socket.emit("log", "Connected to Meme Coin Bot Dashboard");
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  io.emit("log", `Server running on port ${PORT}`);
});
