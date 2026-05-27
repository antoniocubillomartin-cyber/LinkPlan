export type User = {
  id: string;
  name: string;
  username?: string | null;
  color: string;
  foodTags: string[];
  activityTags: string[];
  pace: 'relajado' | 'moderado' | 'intenso';
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
};

export type Plan = {
  id: string;
  date: string;
  pace: string;
  zone: string;
  totalPeople: number;
  totalBudget: number;
  totalCost: number;
  remainingBudget: number;
  allUsers: User[];
  morning: Venue;
  lunch: Venue;
  afternoon: Venue;
};

export type Reservation = {
  id: string;
  code: string;
  status: string;
  plan: {
    totalCost: number;
    totalBudget: number;
    date: string;
    participants: { user: User }[];
    morningVenue: Venue;
    lunchVenue: Venue;
    afternoonVenue: Venue;
  };
};
