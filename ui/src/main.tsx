import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { getFullnodeUrl } from '@mysten/sui/client'
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit'
import '@mysten/dapp-kit/dist/index.css' // Import dapp-kit styles

const queryClient = new QueryClient()

// Setup network config for devnet
const { networkConfig } = createNetworkConfig({
  // devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  // mainnet: { url: getFullnodeUrl('mainnet') },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig}>
        <WalletProvider autoConnect={true}> {/* autoConnect can be true or false based on preference */}
          <App />
        </WalletProvider>
      </SuiClientProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
