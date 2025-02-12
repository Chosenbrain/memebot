// test-provider.js
import 'dotenv/config';
import { ethers } from 'ethers';

(async () => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(
      `wss://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );
    const network = await provider.getNetwork();
    console.log("Connected network:", network);
  } catch (err) {
    console.error("Provider error:", err);
  }
})();
