const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files for the dashboard (like HTML, CSS, JS)
app.use(express.static('public'));

// Endpoint for testing server status
app.get('/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Real-time updates via WebSocket
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send initial data
  socket.emit('tradeData', getTradeData());

  // Periodically send updates
  const interval = setInterval(() => {
    socket.emit('tradeData', getTradeData());
  }, 5000);

  // Disconnect event
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    clearInterval(interval);
  });
});

// Function to get trade data
function getTradeData() {
    try {
      if (!fs.existsSync('tradeLog.json')) {
        fs.writeFileSync('tradeLog.json', JSON.stringify([]));
      }
      const tradeData = JSON.parse(fs.readFileSync('tradeLog.json', 'utf8'));
      const totalTrades = tradeData.length;
      const openTrades = tradeData.filter(trade => trade.status === 'open').length;
      const closedTrades = tradeData.filter(trade => trade.status === 'closed').length;
      const netProfitLoss = tradeData.reduce((acc, trade) => acc + (trade.profitLoss || 0), 0);
  
      return {
        trades: tradeData.slice(-10), // Send the latest 10 trades
        totalTrades,
        openTrades,
        closedTrades,
        netProfitLoss
      };
    } catch (err) {
      console.error('Error reading trade data:', err.message);
      return {
        trades: [],
        totalTrades: 0,
        openTrades: 0,
        closedTrades: 0,
        netProfitLoss: 0
      };
    }
  }
  

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
});
