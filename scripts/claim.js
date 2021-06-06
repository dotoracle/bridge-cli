require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/ERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
var args = process.argv.slice(2);

const fromChainId = args[0]
const toChainId = args[1]

const privateKey = process.env.PRIVATE_KEY
const rpcFrom = config.get(`blockchain.${fromChainId}.httpProvider`)
const rpcTo = config.get(`blockchain.${toChainId}.httpProvider`)
const singer = require('./requestSigner')

const bridgeAddressFrom = config.get(`contracts.${fromChainId}.bridge`)
const bridgeAddressTo = config.get(`contracts.${toChainId}.bridge`)

const gasPrice = '20000000000'
const log = console.log
const nativeAddress = config.get('nativeAddress')

const axios = require('axios')

async function requestTxes(acc, networkId) {
	let apiUrl = config.get('apiUrl')
	apiUrl = `${apiUrl}/transactions/${acc.toLowerCase()}/${networkId}`

	let txes = await axios.get(apiUrl)
	return txes.data.transactions
}

async function claimToken() {
	const web3From = new Web3(new PrivateKeyProvider(privateKey, rpcFrom))
	const web3To = new Web3(new PrivateKeyProvider(privateKey, rpcTo))

	const accounts = await web3From.eth.getAccounts();
    const mainAccount = accounts[0];
	let balance = await web3To.eth.getBalance(mainAccount)
	console.log('rpcTo:', rpcTo)
    log('claim token for account', mainAccount, new BN(balance).dividedBy(new BN('1e18')).toFixed(4));	

	const bridgeFrom = await new web3From.eth.Contract(GenericBridgeABI, bridgeAddressFrom)
	//reading events
	let fromBlock = config.get(`contracts.${fromChainId}.firstBlockCrawl`)
	console.log('fromBlock:', fromBlock)
	fromBlock = parseInt(fromBlock)
	let endBlock = await web3From.eth.getBlockNumber()
	endBlock = parseInt(endBlock)
	let eventList = await requestTxes(mainAccount, fromChainId)
	for(const e of eventList) {
		try {
			let data = e
			let originToken = data.originToken
			let rpcOrigin = config.get(`blockchain.${data.originChainId}.httpProvider`)
			let web3Origin = new Web3(new PrivateKeyProvider(privateKey, rpcOrigin))

			let chainIdData = [data.originChainId, data.fromChainId, data.toChainId, data.index]
			if (data.fromChainId != fromChainId || data.toChainId != toChainId) {
				continue
			}
			console.log('trying to claim')
			if (data.claimHash) {
				console.log('already claim')
				continue
			}
			let sig = await singer.signClaim(data.requestHash, data.fromChainId, data.toChainId, data.index)
			
			if (!sig) {
				console.log('invalid signature')
				continue
			}

			const bridgeTo = await new web3To.eth.Contract(GenericBridgeABI, bridgeAddressTo)
			let alreadyClaim = await bridgeTo.methods.alreadyClaims(sig.msgHash).call()
			if (!alreadyClaim) {
				//making claim tx
				await bridgeTo.methods.claimToken(originToken, mainAccount, data.amount, chainIdData, data.requestHash, sig.r, sig.s, sig.v, sig.name, sig.symbol, sig.decimals)
					.send({chainId: web3To.utils.toHex(toChainId), from: mainAccount, gasPrice: gasPrice, gas: 5000000})
			} else {
				console.log('already claim')
				continue
			}
			let bridgeToken = await bridgeTo.methods.tokenMap(data.originChainId, data.originToken).call()
			if (data.originChainId == data.toChainId) {
				bridgeToken = data.originToken
				console.log('done, claimed token:', bridgeToken)
			} else {
				console.log('done, claimed token:', bridgeToken)
			}
		} catch(e) {
			console.log('e:', e)
		}
		
	}
	console.log('finish')
}

claimToken()