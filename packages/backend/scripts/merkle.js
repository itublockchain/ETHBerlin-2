const axios = require("axios");
const { MerkleTree } = require("merkletreejs");
const Merkle = require("merkle-js");
const SHA256 = require("crypto-js/sha256");
const { ethers } = require("ethers"); // Ethereum JavaScript API

const btcRpcUrl = `https://api.blockcypher.com/v1/btc/test3/`;
const ETH_API_KEY = process.env.ETH_API_KEY;
const ethNodeUrl = `https://eth-sepolia.g.alchemy.com/v2/${ETH_API_KEY}`;
const relayContractAddress = "";
const relayContractAbi = [
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "HashToMerkle",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "header",
        type: "bytes",
      },
    ],
    name: "HeaderToMerkle",
    outputs: [
      {
        internalType: "bytes32",
        name: "merkle",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "txHash",
        type: "bytes32",
      },
      {
        internalType: "bytes32[]",
        name: "merkleProof",
        type: "bytes32[]",
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32",
      },
    ],
    name: "verifyBitcoinTransaction",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
// Initialize Ethereum ethers connection
const privateKey = process.env.ETH_PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider(ethNodeUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const relayContract = new ethers.Contract(
  relayContractAddress,
  relayContractAbi,
  provider
);
const contractWithSigner = relayContract.connect(wallet);

function toBytes32(hexString) {
  const bufferValue = Buffer.from(hexString, "hex");
  if (bufferValue.length !== 32) {
    throw new Error("Hash must be 32 bytes long");
  }
  return "0x" + bufferValue.toString("hex");
}
function stringArrayToBytes32Array(stringArray) {
  return stringArray.map((str) => {
    // Check if the string is already in hexadecimal format (0x followed by 64 hex characters)
    if (/^0x[0-9a-fA-F]{64}$/.test(str)) {
      // If already a valid 32-byte hex string, use it directly
      return str;
    } else {
      // If it's a regular string, convert it to bytes32
      // Note: This is suitable for text strings, not for hex strings
      return ethers.utils.formatBytes32String(str);
    }
  });
}

async function getBlockTransactions(blockHash, givenTxid) {
  try {
    const response = await axios.get(`${btcRpcUrl}/blocks/${blockHash}`);
    const transactions = response.data.txids;
    console.log("transactions:", transactions);
    const leaves = transactions.map((txid) => SHA256(txid));
    const tree = new MerkleTree(leaves, SHA256, { isBitcoinTree: true });
    console.log("tree:", tree.toString());
    const root = tree.getRoot().toString("hex");
    console.log("root:", root);
    const leaf = SHA256(givenTxid);
    const proof = tree.getProof(leaf);
    const proof2 = tree
      .getProof(leaf)
      .map((x) => toBytes32(x.data.toString("hex")));
    const proof3 = tree.getHexProof(leaf);
    console.log("proof:", proof2);
    const bytes32Proof = stringArrayToBytes32Array(proof2);
    console.log(tree.verify(proof, leaf, root)); // true
    const bytes32Tx = toBytes32(givenTxid);
    const bytes32Block = toBytes32(blockHash);
    try {
      // Send the transaction
      const tx = await contractWithSigner.verifyBitcoinTransaction(
        bytes32Tx,
        bytes32Proof,
        bytes32Block
      );
      console.log(tx);
      const receipt = await tx.wait();
      console.log("Transaction receipt:", receipt);
    } catch (e) {
      console.log("Error submitting block header to relay:", e);
      throw e;
    }
    return transactions;
  } catch (e) {
    console.log("Error with Bitcoin RPC getbestblockhash:", e);
    throw e;
  }
}
