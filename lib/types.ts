export type UserRole = "customer" | "dealer" | "admin";

export type ClaimType = "comfort_exchange" | "oem_warranty" | "other";

export type ClaimStatus =
  | "submitted"
  | "under_review"
  | "more_info_needed"
  | "approved"
  | "denied"
  | "ra_issued"
  | "completed"
  | "cancelled";

export type PhotoAngle =
  | "law_tag"
  | "model_tag"
  | "top"
  | "side"
  | "corner"
  | "overall"
  | "concern"
  | "other";

export interface Guarantee {
  id: string;
  transId: string;
  storeId: string;
  purchDate: string; // ISO, used as start_date
  custId?: string;
  custNam: string;
  custStreet?: string;
  custStreet2?: string;
  custCit?: string;
  custSt?: string;
  custZip?: string;
  custEmail?: string;
  custPhone?: string;
  manufacturer: string;
  modelNum: string;
  prodRetailPrice: number;
  prodSku?: string;
  prodCat?: string;
  prodDesc?: string;
  contractSku?: string;
  guaranteeNumber?: string;
}

export interface Photo {
  id: string;
  angle: PhotoAngle;
  url: string;
  visionAnalysis?: {
    extractedText?: string;
    matchConfidence?: number;
    notes?: string;
  };
}

export interface ClaimNote {
  id: string;
  body: string;
  isInternal: boolean;
  author: string;
  createdAt: string;
}

export interface Claim {
  id: string;
  guaranteeId: string;
  guarantee?: Guarantee;
  customerId?: string;
  claimType: ClaimType;
  status: ClaimStatus;
  issueDescription: string;
  daysSinceDelivery: number;
  conditionSanitary?: boolean;
  tagsIntact?: boolean;
  protectorUsed?: boolean | null;
  restockingFeeAcknowledged: boolean;
  fastInspectionRequested: boolean;
  eligibilityFlags: string[];
  structuredData?: Record<string, unknown>;
  chatTranscript?: { role: "user" | "assistant"; content: string }[];
  photos: Photo[];
  raNumber?: string;
  createdAt: string;
  updatedAt: string;
  notes?: ClaimNote[];
}
