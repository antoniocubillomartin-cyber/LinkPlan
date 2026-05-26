function scorePlace(place, tags = [], zone = '') {
  const tagScore = place.tags.filter((tag) => tags.some((u) => u === tag || u.includes(tag) || tag.includes(u))).length;
  const zoneBonus = zone && place.zone.includes(zone) ? 2 : 0;
  return tagScore + zoneBonus;
}

function pickPace(users) {
  const paceCounts = { relajado: 0, moderado: 0, intenso: 0 };
  users.forEach((u) => {
    if (paceCounts[u.pace] !== undefined) paceCounts[u.pace] += 1;
  });
  return Object.entries(paceCounts).sort((a, b) => b[1] - a[1])[0][0] ?? 'moderado';
}

function generatePlan({ organizer, companions, budgetPerPerson, date, zone, restaurants, activities }) {
  const allUsers = [organizer, ...companions];
  if (!organizer || allUsers.length === 0) {
    throw new Error('Organizer is required');
  }

  const totalPeople = allUsers.length;
  const totalBudget = budgetPerPerson * totalPeople;
  const mergedFood = [...new Set(allUsers.flatMap((u) => u.foodTags))];
  const mergedActivities = [...new Set(allUsers.flatMap((u) => u.activityTags))];
  const pace = pickPace(allUsers);

  let rankedRestaurants = restaurants
    .filter((r) => r.available)
    .filter((r) => r.price * totalPeople <= totalBudget * 0.45)
    .map((r) => ({ ...r, score: scorePlace(r, mergedFood, zone) }))
    .sort((a, b) => b.score - a.score);

  let rankedActivities = activities
    .filter((a) => a.available)
    .map((a) => ({ ...a, score: scorePlace(a, mergedActivities, zone) }))
    .sort((a, b) => b.score - a.score);

  if (pace === 'intenso') rankedActivities = rankedActivities.filter((a) => !a.tags.includes('relax'));
  if (pace === 'relajado') rankedActivities = rankedActivities.sort((a, b) => (a.tags.includes('adrenalina') ? 1 : 0) - (b.tags.includes('adrenalina') ? 1 : 0));

  const morning = rankedActivities.find((a) => a.price <= 20) ?? rankedActivities[0];
  const lunch = rankedRestaurants[0];
  const afternoon = rankedActivities.find((a) => a.id !== morning?.id) ?? rankedActivities[1];

  if (!morning || !lunch || !afternoon) {
    throw new Error('No available itinerary for selected budget/preferences');
  }

  const totalCost = (morning.price + lunch.price + afternoon.price) * totalPeople;
  const remainingBudget = totalBudget - totalCost;

  return {
    date,
    zone,
    pace,
    organizer,
    companions,
    allUsers,
    totalPeople,
    budgetPerPerson,
    totalBudget,
    totalCost,
    remainingBudget,
    mergedFood,
    mergedActivities,
    morning,
    lunch,
    afternoon
  };
}

module.exports = { generatePlan };
