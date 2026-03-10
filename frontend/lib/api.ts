export type AnalyzeRequest = {
  source: string;
  url?: string;
  brand?: string;
  model?: string;
  year?: number | null;
  km?: number | null;
  fuel?: string;
  asking_price?: number | null;
  city?: string;
  raw_text?: string;
};

export type AppSettings = {
  preferred_city: string;
  max_asking_price: number;
  min_net_profit: number;
  min_margin_percent: number;
  max_km_benzin: number;
  max_km_diesel: number;
  min_year: number;
  clean_prep_cost: number;
  issue_prep_cost: number;
  transfer_cost: number;
  sales_cost_percent: number;
  exit_discount_percent: number;
  low_risk_discount_percent: number;
  medium_risk_discount_percent: number;
  high_risk_discount_percent: number;
};

export type AnalyzeResponse = {
  url?: string | null;
  brand: string;
  model: string;
  title: string;
  source: string;
  city: string;
  year: number;
  km: number;
  fuel: string;
  asking_price: number;
  offer_price: number;
  total_cost: number;
  target_sale_price: number;
  net_profit: number;
  margin_percent: number;
  risk_level: "low" | "medium" | "high";
  recommendation: "buy" | "caution" | "skip";
  source_parser: string;
  parser_confidence: number;
  parser_notes: string[];
  buy_box_status: "fit" | "review" | "out";
  buy_box_notes: string[];
  confidence_score: number;
  verification_required: boolean;
  verification_notes: string[];
  negotiation_points: string[];
  recommended_message: string;
  next_action: string;
  operator_note: string;
  summary: string;
  strengths: string[];
  warnings: string[];
};

export type SavedDeal = AnalyzeResponse & {
  id: number;
  created_at: string;
};

export type PortfolioDeal = SavedDeal & {
  status: "sourcing" | "prep" | "sold";
};

export type SearchProfile = {
  id: number;
  created_at: string;
  label: string;
  source: string;
  search_url: string;
  city: string;
  max_price?: number | null;
  min_year?: number | null;
  min_profit?: number | null;
  notes: string;
  active: boolean;
};

export type SearchProfileCreate = Omit<SearchProfile, "id" | "created_at">;

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured !== undefined) {
    return configured;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === "localhost" || host === "127.0.0.1") && port === "3000") {
      return "http://localhost:8000";
    }
  }

  return "";
}

const API_BASE_URL = resolveApiBaseUrl();

export async function analyzeListing(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Analysis request failed.");
  }

  return response.json() as Promise<AnalyzeResponse>;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/settings`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Settings request failed.");
  }
  return response.json() as Promise<AppSettings>;
}

export async function updateAppSettings(payload: AppSettings): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Settings update failed.");
  }

  return response.json() as Promise<AppSettings>;
}

export async function fetchWatchlist(): Promise<SavedDeal[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/watchlist`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Watchlist request failed.");
  }
  return response.json() as Promise<SavedDeal[]>;
}

export async function createWatchlistDeal(payload: AnalyzeResponse): Promise<SavedDeal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/watchlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Watchlist save failed.");
  }

  return response.json() as Promise<SavedDeal>;
}

export async function deleteWatchlistDeal(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/watchlist/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Watchlist delete failed.");
  }
}

export async function updateWatchlistNote(id: number, operator_note: string): Promise<SavedDeal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/watchlist/${id}/note`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operator_note }),
  });

  if (!response.ok) {
    throw new Error("Watchlist note update failed.");
  }

  return response.json() as Promise<SavedDeal>;
}

export async function fetchPortfolio(): Promise<PortfolioDeal[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Portfolio request failed.");
  }
  return response.json() as Promise<PortfolioDeal[]>;
}

export async function fetchSearchProfiles(): Promise<SearchProfile[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/search-profiles`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Search profiles request failed.");
  }
  return response.json() as Promise<SearchProfile[]>;
}

export async function createSearchProfile(payload: SearchProfileCreate): Promise<SearchProfile> {
  const response = await fetch(`${API_BASE_URL}/api/v1/search-profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Search profile save failed.");
  }

  return response.json() as Promise<SearchProfile>;
}

export async function updateSearchProfileStatus(id: number, active: boolean): Promise<SearchProfile> {
  const response = await fetch(`${API_BASE_URL}/api/v1/search-profiles/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  });

  if (!response.ok) {
    throw new Error("Search profile update failed.");
  }

  return response.json() as Promise<SearchProfile>;
}

export async function deleteSearchProfile(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/search-profiles/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Search profile delete failed.");
  }
}

export async function createPortfolioDeal(payload: AnalyzeResponse): Promise<PortfolioDeal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Portfolio save failed.");
  }

  return response.json() as Promise<PortfolioDeal>;
}

export async function updatePortfolioStatus(
  id: number,
  status: PortfolioDeal["status"],
): Promise<PortfolioDeal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error("Portfolio update failed.");
  }

  return response.json() as Promise<PortfolioDeal>;
}

export async function deletePortfolioDeal(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Portfolio delete failed.");
  }
}

export async function updatePortfolioNote(id: number, operator_note: string): Promise<PortfolioDeal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/${id}/note`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operator_note }),
  });

  if (!response.ok) {
    throw new Error("Portfolio note update failed.");
  }

  return response.json() as Promise<PortfolioDeal>;
}
