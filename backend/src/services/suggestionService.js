const { scorePlace } = require('./planService');

const MIN_IMPROVEMENT = 0.2;

function bestAlternative({ current, candidates, mergedTags, zone, maxPrice, excludeIds }) {
  const currentScore = scorePlace(current, mergedTags, zone);
  const exclude = new Set([current.id, ...excludeIds]);
  const ranked = candidates
    .filter((v) => v.available && !exclude.has(v.id) && v.price <= maxPrice)
    .map((v) => ({ venue: v, score: scorePlace(v, mergedTags, zone) }))
    .sort((a, b) => b.score - a.score || a.venue.price - b.venue.price);

  const top = ranked[0];
  if (!top) return null;

  const qualifies =
    currentScore > 0 ? top.score >= currentScore * (1 + MIN_IMPROVEMENT) : top.score > 0;
  if (!qualifies) return null;

  const improvement = currentScore > 0 ? `+${Math.round(((top.score - currentScore) / currentScore) * 100)}%` : 'nuevo match';

  return {
    currentScore,
    alternativeScore: top.score,
    scoreImprovement: improvement,
    priceDelta: top.venue.price - current.price,
    venue: top.venue
  };
}

function computePlanSuggestions(plan, venues) {
  if (plan.status !== 'ACTIVE') return [];

  const users = plan.participants.map((p) => p.user);
  const mergedFood = [...new Set(users.flatMap((u) => u.foodTags || []))];
  const mergedActivities = [...new Set(users.flatMap((u) => u.activityTags || []))];
  const zone = plan.zone || '';

  const restaurants = venues.filter((v) => v.type === 'RESTAURANT');
  const activities = venues.filter((v) => v.type === 'ACTIVITY');
  const perPerson = (plan.morningVenue?.price ?? 0) + plan.lunchVenue.price + (plan.afternoonVenue?.price ?? 0);

  const slots = [];
  if (plan.morningVenue) {
    slots.push({
      slot: 'morning',
      current: plan.morningVenue,
      candidates: activities,
      mergedTags: mergedActivities,
      maxPrice: plan.budgetPerPerson - (perPerson - plan.morningVenue.price),
      excludeIds: plan.afternoonVenueId ? [plan.afternoonVenueId] : []
    });
  }
  slots.push({
    slot: 'lunch',
    current: plan.lunchVenue,
    candidates: restaurants,
    mergedTags: mergedFood,
    maxPrice: plan.budgetPerPerson - (perPerson - plan.lunchVenue.price),
    excludeIds: []
  });
  if (plan.afternoonVenue) {
    slots.push({
      slot: 'afternoon',
      current: plan.afternoonVenue,
      candidates: activities,
      mergedTags: mergedActivities,
      maxPrice: plan.budgetPerPerson - (perPerson - plan.afternoonVenue.price),
      excludeIds: plan.morningVenueId ? [plan.morningVenueId] : []
    });
  }

  const suggestions = [];
  for (const s of slots) {
    const alt = bestAlternative({
      current: s.current,
      candidates: s.candidates,
      mergedTags: s.mergedTags,
      zone,
      maxPrice: s.maxPrice,
      excludeIds: s.excludeIds
    });
    if (!alt) continue;
    suggestions.push({
      slot: s.slot,
      currentVenueId: s.current.id,
      currentVenueName: s.current.name,
      currentScore: alt.currentScore,
      alternativeVenueId: alt.venue.id,
      alternativeVenueName: alt.venue.name,
      alternativeScore: alt.alternativeScore,
      scoreImprovement: alt.scoreImprovement,
      priceDelta: alt.priceDelta
    });
  }
  return suggestions;
}

module.exports = { computePlanSuggestions };
