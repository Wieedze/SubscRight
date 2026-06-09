/**
 * Deploy a 1/1 test Safe on Base Sepolia + DeleGator module (enabled) + fund USDC.
 * Owner = the test key. Outputs the Safe + module addresses.
 *
 *   PK=0x... RPC=https://base-sepolia-rpc.publicnode.com node scripts/setup-test-safe.mjs
 */
import {
  createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, parseUnits, formatUnits,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = process.env.RPC || 'https://base-sepolia-rpc.publicnode.com'
const SAFE_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'
const SAFE_SINGLETON_L2 = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'
const FALLBACK_HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99' // CompatibilityFallbackHandler v1.4.1 (ERC-1271)
const MODULE_FACTORY = '0xE64ea779033131583cDE1c8862685051E09C4b78'
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const DEFAULT_SALT = '0x0000000000000000000000000000000000000000000000000000000000000001'

const SafeProxyFactoryABI = parseAbi([
  'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
  'event ProxyCreation(address indexed proxy, address singleton)',
])
const SafeABI = parseAbi([
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function enableModule(address module)',
  'function isModuleEnabled(address module) view returns (bool)',
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)',
])
const FactoryABI = parseAbi([
  'function deploy(address _safe, bytes32 _salt) returns (address module_, bool alreadyDeployed_)',
  'function predictAddress(address _safe, bytes32 _salt) view returns (address predicted_)',
])
const ZERO = '0x0000000000000000000000000000000000000000'

const account = privateKeyToAccount(process.env.PK)
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) })
const wc = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) })

async function send(req) {
  const hash = await wc.writeContract(req)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`tx reverted: ${hash}`)
  return r
}

// 1/1 Safe with ERC-1271 fallback handler
const setupData = encodeFunctionData({
  abi: SafeABI,
  functionName: 'setup',
  args: [[account.address], 1n, ZERO, '0x', FALLBACK_HANDLER, ZERO, 0n, ZERO],
})
const saltNonce = BigInt(Math.floor(Date.now() / 1000))
const r1 = await send({
  address: SAFE_PROXY_FACTORY, abi: SafeProxyFactoryABI,
  functionName: 'createProxyWithNonce', args: [SAFE_SINGLETON_L2, setupData, saltNonce],
})
let safe
for (const log of r1.logs) {
  if (log.address.toLowerCase() === SAFE_PROXY_FACTORY.toLowerCase()) {
    safe = ('0x' + log.topics[1].slice(26))
    break
  }
}
console.log('Safe deployed:', safe)

// Deploy module + enable on the Safe
const moduleAddr = await pub.readContract({ address: MODULE_FACTORY, abi: FactoryABI, functionName: 'predictAddress', args: [safe, DEFAULT_SALT] })
await send({ address: MODULE_FACTORY, abi: FactoryABI, functionName: 'deploy', args: [safe, DEFAULT_SALT] })
console.log('Module deployed:', moduleAddr)

// enableModule via Safe execTransaction (1/1 owner signature, eth_sign v+4)
const enableData = encodeFunctionData({ abi: SafeABI, functionName: 'enableModule', args: [moduleAddr] })
const nonce = await pub.readContract({ address: safe, abi: SafeABI, functionName: 'nonce' })
const safeTxHash = await pub.readContract({
  address: safe, abi: SafeABI, functionName: 'getTransactionHash',
  args: [safe, 0n, enableData, 0, 0n, 0n, 0n, ZERO, ZERO, nonce],
})
const sig = await account.signMessage({ message: { raw: safeTxHash } })
const r = sig.slice(0, 66), s = sig.slice(66, 130)
const v = (parseInt(sig.slice(130, 132), 16) + 4).toString(16).padStart(2, '0')
const signatures = '0x' + r.slice(2) + s + v
await send({
  address: safe, abi: SafeABI, functionName: 'execTransaction',
  args: [safe, 0n, enableData, 0, 0n, 0n, 0n, ZERO, ZERO, signatures],
})
const enabled = await pub.readContract({ address: safe, abi: SafeABI, functionName: 'isModuleEnabled', args: [moduleAddr] })
console.log('Module enabled:', enabled)

// Fund the Safe with USDC (from the test key)
const erc20 = parseAbi(['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'])
const bal = await pub.readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [account.address] })
console.log('Test key USDC:', formatUnits(bal, 6))
if (bal >= parseUnits('5', 6)) {
  await send({ address: USDC, abi: erc20, functionName: 'transfer', args: [safe, parseUnits('5', 6)] })
  console.log('Funded Safe with 5 USDC')
} else {
  console.log('⚠️ Test key has <5 USDC — fund the Safe manually:', safe)
}

console.log('\n=== TEST SAFE READY ===')
console.log('SAFE   :', safe)
console.log('MODULE :', moduleAddr, '(= delegator)')
console.log('OWNER  :', account.address)
