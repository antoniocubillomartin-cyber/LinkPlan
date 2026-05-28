export type User = {
  id: string;
  name: string;
  username?: string | null;
  description?: string | null;
  color: string;
  foodTags: string[];
  activityTags: string[];
  pace: 'relajado' | 'moderado' | 'intenso';
};

export type TrendTag = {
  tag: string;
  kind: 'food' | 'activity';
  score: number;
  users: number;
  venues: number;
};

export type TrendingCategories = {
  food: TrendTag[];
  activity: TrendTag[];
  top: TrendTag[];
};

export type Venue = {
  id: string;
  name: string;
  zone: string;
  tags: string[];
  price: number;
  schedule: string;
  url: string;
  available: boolean;
  type: 'RESTAURANT' | 'ACTIVITY';
  urlValid?: boolean | null;
  lastStatusCode?: number | null;
  lastVerified?: string | null;
};

export type Plan = {
  id?: string;
  preview?: boolean;
  date: string;
  pace: string;
  zone: string;
  duration?: string;
  totalPeople: number;
  totalBudget: number;
  totalCost: number;
  remainingBudget: number;
  allUsers: User[];
  morning: Venue;
  lunch: Venue;
  afternoon: Venue;
};

export type StoredPlan = {
  id: string;
  date: string;
  pace: string;
  zone: string | null;
  duration: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  budgetPerPerson: number;
  totalBudget: number;
  totalCost: number;
  remainingBudget: number;
  organizer: User;
  organizerId: string;
  participants: { user: User }[];
  morningVenue: Venue;
  lunchVenue: Venue;
  afternoonVenue: Venue;
  reservation: Reservation | null;
  createdAt: string;
};

export type PlanSuggestion = {
  slot: 'morning' | 'lunch' | 'afternoon';
  currentVenueId: string;
  currentVenueName: string;
  currentScore: number;
  alternativeVenueId: string;
  alternativeVenueName: string;
  alternativeScore: number;
  scoreImprovement: string;
  priceDelta: number;
};

export type PlanSuggestions = {
  planId: string;
  suggestions: PlanSuggestion[];
};

export type Reservation = {
  id: string;
  code: string;
  status: string;
  plan?: {
    totalCost: number;
    totalBudget: number;
    date: string;
    participants: { user: User }[];
    morningVenue: Venue;
    lunchVenue: Venue;
    afternoonVenue: Venue;
  };
};
