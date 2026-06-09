#!/usr/bin/env node
/**
 * deploy-factory.mjs
 *
 * Deploys the DeleGatorModuleFactory to a live chain (default: Ethereum Sepolia).
 * Same creation bytecode already used for the local/Base deployments — no new code,
 * just one deployment tx. Constructor arg = the (deterministic) DelegationManager.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-factory.mjs
 *
 * Optional env:
 *   RPC_URL   custom RPC (default: a public Ethereum Sepolia node)
 *
 * After it prints the deployed address, paste it into src/config/addresses.ts
 * under chain 11155111 (delegatorModuleFactory).
 */

import { createWalletClient, createPublicClient, http, parseAbi, encodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains' // Ethereum Sepolia (11155111)
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

const raw = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY
if (!raw) {
  console.error('❌ Set DEPLOYER_PRIVATE_KEY (a wallet funded with a little SepETH).')
  process.exit(1)
}
const privateKey = raw.startsWith('0x') ? raw : `0x${raw}`

// Deterministic across chains (MetaMask Delegation Framework v1.3.0)
const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'

// Single source of truth: reuse the exact bytecode committed in test/setup-local.mjs
const setupSrc = readFileSync(join(__dirname, '../test/setup-local.mjs'), 'utf8')
const FACTORY_BYTECODE = setupSrc.match(/const FACTORY_BYTECODE = '(0x[0-9a-fA-F]+)'/)?.[1]
if (!FACTORY_BYTECODE) {
  console.error('❌ Could not extract FACTORY_BYTECODE from test/setup-local.mjs')
  process.exit(1)
}

const FactoryABI = parseAbi([
  'function delegationManager() view returns (address)',
  'function predictAddress(address _safe, bytes32 _salt) view returns (address predicted_)',
])

const account = privateKeyToAccount(privateKey)
const transport = http(RPC_URL)
const pub = createPublicClient({ chain: sepolia, transport })
const wallet = createWalletClient({ account, chain: sepolia, transport })

console.log(`Chain:    Ethereum Sepolia (${sepolia.id})`)
console.log(`RPC:      ${RPC_URL}`)
console.log(`Deployer: ${account.address}`)

const balance = await pub.getBalance({ address: account.address })
console.log(`Balance:  ${balance} wei`)
if (balance === 0n) {
  console.error('❌ Deployer has 0 SepETH. Fund it first (e.g. a Sepolia faucet).')
  process.exit(1)
}

const constructorArgs = encodeAbiParameters([{ type: 'address' }], [DELEGATION_MANAGER])
const data = FACTORY_BYTECODE + constructorArgs.slice(2)

console.log('\n🏭 Deploying DeleGatorModuleFactory...')
const hash = await wallet.sendTransaction({ data })
console.log(`   tx: ${hash}`)
const receipt = await pub.waitForTransactionReceipt({ hash })
const factory = receipt.contractAddress
if (!factory) {
  console.error('❌ No contractAddress in receipt — deployment failed.')
  process.exit(1)
}
console.log(`   ✅ Factory deployed: ${factory}`)

// Sanity check: factory wired to the right DelegationManager + predictAddress works.
const dm = await pub.readContract({ address: factory, abi: FactoryABI, functionName: 'delegationManager' })
if (dm.toLowerCase() !== DELEGATION_MANAGER.toLowerCase()) {
  console.error(`❌ DelegationManager mismatch: expected ${DELEGATION_MANAGER}, got ${dm}`)
  process.exit(1)
}
const probe = await pub.readContract({
  address: factory,
  abi: FactoryABI,
  functionName: 'predictAddress',
  args: [account.address, '0x0000000000000000000000000000000000000000000000000000000000000001'],
})
console.log(`   predictAddress() OK → ${probe}`)

console.log('\n✅ Done. Update src/config/addresses.ts (chain 11155111):')
console.log(`   delegatorModuleFactory: '${factory}' as Address,`)
console.log(`\n   sepolia.etherscan.io/address/${factory}`)
