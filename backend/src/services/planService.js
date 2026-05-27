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

function durationFilter(activities, duration) {
  // 'corto' favours short/free things, 'largo' favours immersive/cultural ones
  if (duration === 'corto') return activities.filter((a) => !a.tags.includes('exposiciones') && !a.tags.includes('conciertos'));
  if (duration === 'largo') return activities;
  return activities;
}

function hashCombo(a, b, c) {
  return `${a.id}|${b.id}|${c.id}`;
}

function generatePlan({
  organizer,
  companions,
  budgetPerPerson,
  date,
  zone,
  restaurants,
  activities,
  duration = 'medio',
  excludeIds = [],
  variantSeed = 0
}) {
  const allUsers = [organizer, ...companions];
  if (!organizer || allUsers.length === 0) {
    throw new Error('Organizer is required');
  }

  const totalPeople = allUsers.length;
  const totalBudget = budgetPerPerson * totalPeople;
  const mergedFood = [...new Set(allUsers.flatMap((u) => u.foodTags))];
  const mergedActivities = [...new Set(allUsers.flatMap((u) => u.activityTags))];
  const pace = pickPace(allUsers);
  const excludeSet = new Set(excludeIds);

  let rankedRestaurants = restaurants
    .filter((r) => r.available && r.price <= budgetPerPerson)
    .map((r) => ({ ...r, score: scorePlace(r, mergedFood, zone) }))
    .sort((a, b) => b.score - a.score || a.price - b.price);

  let rankedActivities = activities
    .filter((a) => a.available && a.price <= budgetPerPerson)
    .map((a) => ({ ...a, score: scorePlace(a, mergedActivities, zone) }))
    .sort((a, b) => b.score - a.score || a.price - b.price);

  rankedActivities = durationFilter(rankedActivities, duration);

  if (pace === 'intenso') rankedActivities = rankedActivities.filter((a) => !a.tags.includes('relax'));
  if (pace === 'relajado') {
    rankedActivities = [...rankedActivities].sort(
      (a, b) => (a.tags.includes('adrenalina') ? 1 : 0) - (b.tags.includes('adrenalina') ? 1 : 0)
    );
  }

  const candidateMornings = rankedActivities.filter((a) => !excludeSet.has(a.id)).slice(0, 12);
  const candidateLunches = rankedRestaurants.filter((r) => !excludeSet.has(r.id)).slice(0, 12);
  const candidateAfternoons = rankedActivities.filter((a) => !excludeSet.has(a.id)).slice(0, 12);

  let best = null;
  for (const m of candidateMornings) {
    for (const l of candidateLunches) {
      for (const a of candidateAfternoons) {
        if (a.id === m.id) continue;
        const perPerson = m.price + l.price + a.price;
        if (perPerson > budgetPerPerson) continue;
        const score = m.score + l.score + a.score + (variantSeed ? (hashCombo(m, l, a).length * variantSeed) % 5 : 0);
        if (!best || score > best.score || (score === best.score && perPerson < best.perPerson)) {
          best = { morning: m, lunch: l, afternoon: a, score, perPerson };
        }
      }
    }
  }

  if (!best) {
    throw new Error('No hay combinación posible dentro del presupuesto. Sube el presupuesto o relaja los filtros.');
  }

  const { morning, lunch, afternoon, perPerson } = best;
  const totalCost = perPerson * totalPeople;
  const remainingBudget = totalBudget - totalCost;

  return {
    date,
    zone,
    pace,
    duration,
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
