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

// Cada "plan" dura ~1-2h. La duración decide cuántos planes (sitios) entran:
// corto = 1 (comida) · medio = 2 (actividad + comida) · largo = 3 (actividad + comida + actividad).
function slotsForDuration(duration) {
  if (duration === 'corto') return { morning: false, afternoon: false };
  if (duration === 'largo') return { morning: true, afternoon: true };
  return { morning: true, afternoon: false };
}

function variantBonus(seed, ...parts) {
  if (!seed) return 0;
  return (parts.join('|').length * seed) % 5;
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

  if (pace === 'intenso') rankedActivities = rankedActivities.filter((a) => !a.tags.includes('relax'));
  if (pace === 'relajado') {
    rankedActivities = [...rankedActivities].sort(
      (a, b) => (a.tags.includes('adrenalina') ? 1 : 0) - (b.tags.includes('adrenalina') ? 1 : 0)
    );
  }

  const { morning: wantsMorning, afternoon: wantsAfternoon } = slotsForDuration(duration);
  const candidateLunches = rankedRestaurants.filter((r) => !excludeSet.has(r.id)).slice(0, 12);
  const candidateActivities = rankedActivities.filter((a) => !excludeSet.has(a.id)).slice(0, 12);

  let best = null;
  const consider = (morning, lunch, afternoon) => {
    const perPerson = (morning?.price ?? 0) + lunch.price + (afternoon?.price ?? 0);
    if (perPerson > budgetPerPerson) return;
    const score =
      (morning?.score ?? 0) + lunch.score + (afternoon?.score ?? 0) +
      variantBonus(variantSeed, morning?.id ?? '', lunch.id, afternoon?.id ?? '');
    if (!best || score > best.score || (score === best.score && perPerson < best.perPerson)) {
      best = { morning: morning ?? null, lunch, afternoon: afternoon ?? null, score, perPerson };
    }
  };

  for (const l of candidateLunches) {
    if (!wantsMorning) {
      consider(null, l, null);
      continue;
    }
    for (const m of candidateActivities) {
      if (!wantsAfternoon) {
        consider(m, l, null);
        continue;
      }
      for (const a of candidateActivities) {
        if (a.id === m.id) continue;
        consider(m, l, a);
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

module.exports = { generatePlan, scorePlace, pickPace };
