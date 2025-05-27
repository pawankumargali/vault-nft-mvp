const API_BASE_URL = "http://localhost:8081/api/v1";

export interface Token {
  id: number;
  name: string;
  symbol: string;
  icon: string;
  coin_type: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  price_feed_id: string;
  decimals: number;
}

export interface PriceData {
  price: string;
  publish_time: string;
}

export interface TokenPrices {
  [id: string]: PriceData;
}

export async function getSupportedTokens(): Promise<Token[]> {
  const response = await fetch(`${API_BASE_URL}/tokens`);
  if (!response.ok) {
    throw new Error("Failed to fetch supported tokens");
  }
  const data = await response.json();
  return data.data;
}

export async function getTokenPrices(ids: number[]): Promise<TokenPrices> {
  const params = new URLSearchParams();
  ids.forEach(id => params.append("ids[]", id.toString()));
  const response = await fetch(`${API_BASE_URL}/price?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch token prices");
  }
  const data = await response.json();
  return data.data;
}
